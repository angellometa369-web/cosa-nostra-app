/**
 * Confirmación transaccional de un ImportBatch en estado preview.
 * Autoridad: siempre la DB (ImportDecision persistidas), no el body del cliente.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { normalizeClub, normalizeId, normalizeName } from "./normalize";

type Tx = Prisma.TransactionClient;

export interface ConfirmResult {
  batchId: string;
  tournamentId: string;
  status: "confirmed";
  summary: {
    playersCreated: number;
    resultsWritten: number;
    ignored: number;
    externalIdentitiesUpserted: number;
    rankingSnapshots: number;
    rankingChanges: number;
  };
}

function parseRaw(rawDataJson: string): {
  pos: number;
  nameRaw: string;
  betaId: string | null;
  clubRaw: string;
  pj: number;
  pg: number;
  pp: number;
  efe: number;
  pf: number;
  pc: number;
  pm: number;
  avg: number;
  sanctions: number | null;
  pairId?: string;
} {
  const raw = JSON.parse(rawDataJson);
  return {
    pos: Number(raw.pos) || 0,
    nameRaw: String(raw.nameRaw || ""),
    betaId: raw.betaId != null ? String(raw.betaId) : null,
    clubRaw: String(raw.clubRaw || ""),
    pj: Number(raw.pj) || 0,
    pg: Number(raw.pg) || 0,
    pp: Number(raw.pp) || 0,
    efe: Number(raw.efe) || 0,
    pf: Number(raw.pf) || 0,
    pc: Number(raw.pc) || 0,
    pm: Number(raw.pm) || 0,
    avg: Number(raw.avg) || 0,
    sanctions: raw.sanctions != null ? Number(raw.sanctions) : null,
    pairId: raw.pairId != null ? String(raw.pairId) : undefined,
  };
}

/** Valida decisions desde filas de DB */
export function validateDbDecisions(
  decisions: Array<{
    rowIndex: number;
    matchStatus: string;
    action: string | null;
    selectedPlayerId: string | null;
    rawDataJson: string;
  }>
): string[] {
  const errors: string[] = [];
  for (const d of decisions) {
    const action = d.action?.trim() || null;
    const raw = parseRaw(d.rawDataJson);
    if (d.matchStatus === "fuzzy_name" || d.matchStatus === "conflict") {
      if (!action) {
        errors.push(
          `Fila ${d.rowIndex} (${raw.nameRaw}): requiere decisión del administrador`
        );
      }
    }
    // exact_* y new pueden venir con action vacío del create inicial → se interpretan
    const effective =
      action ||
      (d.matchStatus === "exact_id" || d.matchStatus === "exact_name"
        ? "accept_match"
        : d.matchStatus === "new"
          ? "create_new"
          : null);

    if (!effective) {
      errors.push(
        `Fila ${d.rowIndex} (${raw.nameRaw}): sin acción efectiva`
      );
      continue;
    }
    if (
      (effective === "accept_match" || effective === "link_existing") &&
      !d.selectedPlayerId &&
      !(d.matchStatus === "exact_id" || d.matchStatus === "exact_name")
    ) {
      // exact_* puede usar proposedPlayerId; se resuelve en la transacción
    }
  }
  return errors;
}

function effectiveAction(
  matchStatus: string,
  action: string | null
): "accept_match" | "create_new" | "link_existing" | "ignore" | null {
  const a = (action || "").trim();
  if (a === "accept_match" || a === "create_new" || a === "link_existing" || a === "ignore") {
    return a;
  }
  if (matchStatus === "exact_id" || matchStatus === "exact_name") return "accept_match";
  if (matchStatus === "new") return "create_new";
  return null;
}

/**
 * Ejecuta la confirmación completa dentro de una transacción Prisma.
 */
export async function confirmImportBatch(
  prisma: PrismaClient,
  params: {
    batchId: string;
    fileHash: string;
    confirmedById?: string | null;
  }
): Promise<ConfirmResult> {
  const { batchId, fileHash, confirmedById } = params;

  return prisma.$transaction(
    async (tx) => {
      // --- Cargar y bloquear batch ---
      const batch = await tx.importBatch.findUnique({
        where: { id: batchId },
        include: { decisions: { orderBy: { rowIndex: "asc" } } },
      });

      if (!batch) {
        throw new ConfirmError("Batch no encontrado", 404);
      }
      if (batch.fileHash !== fileHash) {
        throw new ConfirmError("fileHash no coincide con el batch", 409);
      }
      if (batch.status === "confirmed") {
        throw new ConfirmError(
          "Este batch ya fue confirmado (protección anti-doble confirmación)",
          409
        );
      }
      if (batch.status !== "preview") {
        throw new ConfirmError(
          `Estado inválido para confirmar: ${batch.status}`,
          409
        );
      }

      // --- Validar decisions (autoridad servidor) ---
      const validationErrors = validateDbDecisions(batch.decisions);
      // Comprobar también que no queden fuzzy/conflict sin action efectiva
      for (const d of batch.decisions) {
        const eff = effectiveAction(d.matchStatus, d.action);
        if (!eff) {
          const raw = parseRaw(d.rawDataJson);
          validationErrors.push(
            `Fila ${d.rowIndex} (${raw.nameRaw}): decisión incompleta`
          );
        }
        if (
          (eff === "accept_match" || eff === "link_existing") &&
          !d.selectedPlayerId &&
          !d.proposedPlayerId
        ) {
          const raw = parseRaw(d.rawDataJson);
          validationErrors.push(
            `Fila ${d.rowIndex} (${raw.nameRaw}): ${eff} requiere jugador`
          );
        }
      }
      if (validationErrors.length > 0) {
        throw new ConfirmError(
          "Hay decisiones pendientes de resolver",
          422,
          validationErrors
        );
      }

      // --- No reimportar si ya existe Tournament con ese externalKey ---
      if (batch.externalKey) {
        const existingTournament = await tx.tournament.findUnique({
          where: { externalKey: batch.externalKey },
        });
        if (existingTournament) {
          throw new ConfirmError(
            "Ya existe un torneo con este externalKey. La reimportación debe ser un flujo explícito separado.",
            409
          );
        }
      }

      // --- Season activa (para RankingSnapshot) ---
      let season = await tx.season.findFirst({
        where: { status: "active" },
        orderBy: { startDate: "desc" },
      });
      if (!season) {
        season = await tx.season.create({
          data: {
            name: `Temporada ${new Date().getFullYear()}`,
            year: new Date().getFullYear(),
            startDate: new Date(`${new Date().getFullYear()}-01-01`),
            status: "active",
          },
        });
      }

      let playersCreated = 0;
      let resultsWritten = 0;
      let ignored = 0;
      let externalIdentitiesUpserted = 0;
      let rankingChanges = 0;

      // --- Snapshot PREVIO de ranking (antes de mutar stats) ---
      type Prior = {
        position: number;
        points: number;
        wins: number;
        losses: number;
        efficiency: number;
      };
      const priorByPlayer = new Map<string, Prior>();
      {
        const priorPlayers = await tx.player.findMany({
          where: { active: true },
        });
        const priorRanked = [...priorPlayers].sort((a, b) => {
          if (b.wins !== a.wins) return b.wins - a.wins;
          if (b.efficiency !== a.efficiency) return b.efficiency - a.efficiency;
          return a.tournamentsPlayed - b.tournamentsPlayed;
        });
        priorRanked.forEach((p, i) => {
          priorByPlayer.set(p.id, {
            position: i + 1,
            points: p.rankingPoints,
            wins: p.wins,
            losses: p.losses,
            efficiency: p.efficiency,
          });
        });
      }

      // Mapa rowIndex → playerId resuelto
      const playerByRow = new Map<number, string>();

      // --- 1–3. Resolver jugadores + ExternalIdentity ---
      for (const d of batch.decisions) {
        const eff = effectiveAction(d.matchStatus, d.action)!;
        const raw = parseRaw(d.rawDataJson);

        if (eff === "ignore") {
          ignored++;
          continue;
        }

        let playerId: string | null = null;

        if (eff === "accept_match" || eff === "link_existing") {
          playerId = d.selectedPlayerId || d.proposedPlayerId;
          if (!playerId) {
            throw new ConfirmError(
              `Fila ${d.rowIndex}: sin playerId para ${eff}`,
              422
            );
          }
          const exists = await tx.player.findUnique({
            where: { id: playerId },
            select: { id: true },
          });
          if (!exists) {
            throw new ConfirmError(
              `Fila ${d.rowIndex}: jugador ${playerId} no existe`,
              422
            );
          }
        } else if (eff === "create_new") {
          const displayName = raw.nameRaw.trim() || "Jugador sin nombre";
          const club = normalizeClub(raw.clubRaw) || raw.clubRaw || null;
          const created = await tx.player.create({
            data: {
              displayName,
              normalizedName: normalizeName(displayName),
              club,
              normalizedClub: club ? normalizeClub(club) : null,
              rankingPoints: 1000,
              efficiency: 0,
              wins: 0,
              losses: 0,
              tournamentsPlayed: 0,
              active: true,
            },
          });
          playerId = created.id;
          playersCreated++;
        }

        if (!playerId) continue;

        // ExternalIdentity (upsert por provider+externalId)
        const betaId = normalizeId(raw.betaId);
        if (betaId) {
          const existing = await tx.externalIdentity.findUnique({
            where: {
              provider_externalId: {
                provider: "betadomino",
                externalId: betaId,
              },
            },
          });
          if (!existing) {
            await tx.externalIdentity.create({
              data: {
                provider: "betadomino",
                externalId: betaId,
                playerId,
              },
            });
            externalIdentitiesUpserted++;
          } else if (existing.playerId !== playerId) {
            // Conflicto de identidad: no sobrescribir en silencio
            throw new ConfirmError(
              `betaId ${betaId} ya está vinculado a otro jugador GFCN`,
              409
            );
          }
        }

        playerByRow.set(d.rowIndex, playerId);
      }

      // --- 4. Crear Tournament ---
      const startDate = batch.tournamentDate
        ? new Date(`${batch.tournamentDate}T12:00:00.000Z`)
        : new Date();

      const tournament = await tx.tournament.create({
        data: {
          seasonId: season.id,
          name: batch.tournamentName,
          type: batch.detectedType,
          status: "finished",
          startDate,
          endDate: startDate,
          roundCount: batch.roundNumber,
          externalSource: "betadomino",
          externalKey: batch.externalKey,
          importBatchId: batch.id,
          description: `Importado desde ${batch.originalFilename}`,
        },
      });

      // --- 5. TournamentResult + actualizar stats del Player ---
      for (const d of batch.decisions) {
        const eff = effectiveAction(d.matchStatus, d.action)!;
        if (eff === "ignore") continue;

        const playerId = playerByRow.get(d.rowIndex);
        if (!playerId) continue;

        const raw = parseRaw(d.rawDataJson);

        await tx.tournamentResult.create({
          data: {
            tournamentId: tournament.id,
            playerId,
            position: raw.pos,
            pairId: raw.pairId ?? null,
            pj: raw.pj,
            pg: raw.pg,
            pp: raw.pp,
            efe: raw.efe,
            pf: raw.pf,
            pc: raw.pc,
            pm: raw.pm,
            avg: raw.avg,
            sanctions: raw.sanctions,
            rawName: raw.nameRaw,
            rawClub: raw.clubRaw,
            rawBetaId: raw.betaId,
          },
        });
        resultsWritten++;

        // Acumular estadísticas (fórmula GFCN actual: stats acumuladas)
        const player = await tx.player.findUniqueOrThrow({
          where: { id: playerId },
        });
        const wins = player.wins + raw.pg;
        const losses = player.losses + raw.pp;
        const played = wins + losses;
        const efficiency = played > 0 ? wins / played : 0;

        await tx.player.update({
          where: { id: playerId },
          data: {
            wins,
            losses,
            tournamentsPlayed: player.tournamentsPlayed + 1,
            efficiency,
          },
        });
      }

      // --- 6–7. Ranking + auditoría de cambios ---
      // Fórmula actual de GFCN: PG → efficiency → tournamentsPlayed
      const allPlayers = await tx.player.findMany({
        where: { active: true },
      });

      const ranked = [...allPlayers].sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.efficiency !== a.efficiency) return b.efficiency - a.efficiency;
        return a.tournamentsPlayed - b.tournamentsPlayed;
      });

      const recordedAt = new Date();
      let rankingSnapshots = 0;
      const affectedPlayerIds = new Set(playerByRow.values());

      for (let i = 0; i < ranked.length; i++) {
        const p = ranked[i];
        const newPosition = i + 1;
        const prior = priorByPlayer.get(p.id);

        await tx.rankingSnapshot.create({
          data: {
            seasonId: season.id,
            playerId: p.id,
            position: newPosition,
            points: p.rankingPoints,
            efficiency: p.efficiency,
            recordedAt,
            importBatchId: batch.id,
          },
        });
        rankingSnapshots++;

        // Registrar cambio si participó en el import o si movió posición
        const positionChanged =
          !prior || prior.position !== newPosition;
        const statsChanged =
          !prior ||
          prior.wins !== p.wins ||
          prior.losses !== p.losses ||
          prior.efficiency !== p.efficiency;

        if (affectedPlayerIds.has(p.id) || positionChanged || statsChanged) {
          const deltaPosition =
            prior != null ? prior.position - newPosition : null;

          await tx.rankingChange.create({
            data: {
              importBatchId: batch.id,
              seasonId: season.id,
              playerId: p.id,
              previousPosition: prior?.position ?? null,
              newPosition,
              previousPoints: prior?.points ?? null,
              newPoints: p.rankingPoints,
              previousWins: prior?.wins ?? null,
              newWins: p.wins,
              previousLosses: prior?.losses ?? null,
              newLosses: p.losses,
              previousEfficiency: prior?.efficiency ?? null,
              newEfficiency: p.efficiency,
              deltaPosition,
            },
          });
          rankingChanges++;
        }
      }

      // --- 8. Marcar batch confirmed (al final) ---
      await tx.importBatch.update({
        where: { id: batch.id },
        data: {
          status: "confirmed",
          confirmedAt: recordedAt,
          confirmedById: confirmedById ?? null,
        },
      });

      return {
        batchId: batch.id,
        tournamentId: tournament.id,
        status: "confirmed" as const,
        summary: {
          playersCreated,
          resultsWritten,
          ignored,
          externalIdentitiesUpserted,
          rankingSnapshots,
          rankingChanges,
        },
      };
    },
    {
      // SQLite: transacciones serializadas; timeout generoso para batches grandes
      maxWait: 10000,
      timeout: 60000,
    }
  );
}

export class ConfirmError extends Error {
  status: number;
  details?: string[];
  constructor(message: string, status = 400, details?: string[]) {
    super(message);
    this.name = "ConfirmError";
    this.status = status;
    this.details = details;
  }
}
