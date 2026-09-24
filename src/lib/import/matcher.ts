/**
 * Matcher de jugadores.
 *
 * Prioridad:
 * 1. betaId exacto (ExternalIdentity)
 * 2. nombre + club exactos
 * 3. nombre único exacto
 * 4. fuzzy (Levenshtein ≤ 2 y nombre ≥ 8) → siempre revisión humana
 * 5. nuevo
 *
 * Protección: mismo betaId + nombre claramente distinto → CONFLICTO
 */

import type {
  ExistingPlayer,
  MatchProposal,
  MatchResult,
  MatchedRow,
  RawPlayerRow,
} from "./types";
import { normalizeClub, normalizeId, normalizeName } from "./normalize";

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function buildProposal(
  rowIndex: number,
  status: MatchProposal["status"],
  confidence: number,
  player: ExistingPlayer | null,
  reason: string,
  candidates?: MatchProposal["candidates"]
): MatchProposal {
  return {
    rowIndex,
    status,
    confidence,
    proposedPlayerId: player?.id ?? null,
    proposedDisplayName: player?.displayName ?? null,
    reason,
    candidates,
  };
}

/**
 * Ejecuta el matching de una lista de filas parseadas contra los jugadores existentes.
 * No escribe nada en base de datos.
 */
export function matchPlayers(
  rows: RawPlayerRow[],
  existingPlayers: ExistingPlayer[]
): MatchResult {
  // Índices para búsqueda rápida
  const byBetaId = new Map<string, ExistingPlayer[]>();
  const byNormName = new Map<string, ExistingPlayer[]>();
  const byNormNameClub = new Map<string, ExistingPlayer[]>();

  for (const p of existingPlayers) {
    for (const bid of p.betaIds) {
      const key = normalizeId(bid);
      if (!key) continue;
      if (!byBetaId.has(key)) byBetaId.set(key, []);
      byBetaId.get(key)!.push(p);
    }

    const nn = p.normalizedName || normalizeName(p.displayName);
    if (nn) {
      if (!byNormName.has(nn)) byNormName.set(nn, []);
      byNormName.get(nn)!.push(p);

      const nc = p.normalizedClub || normalizeClub(p.club);
      const key2 = `${nn}|${nc}`;
      if (!byNormNameClub.has(key2)) byNormNameClub.set(key2, []);
      byNormNameClub.get(key2)!.push(p);
    }
  }

  const matched: MatchedRow[] = [];
  const stats = {
    total: rows.length,
    exactId: 0,
    exactName: 0,
    fuzzyName: 0,
    newPlayers: 0,
    conflicts: 0,
  };

  for (const row of rows) {
    const normName = normalizeName(row.nameRaw);
    const normClub = normalizeClub(row.clubRaw);
    const betaId = normalizeId(row.betaId);

    let proposal: MatchProposal;

    // 1. betaId exacto
    if (betaId && byBetaId.has(betaId)) {
      const candidates = byBetaId.get(betaId)!;
      if (candidates.length === 1) {
        const player = candidates[0];
        const playerNormName =
          player.normalizedName || normalizeName(player.displayName);
        // Protección: mismo ID pero nombre claramente distinto
        if (
          playerNormName &&
          normName &&
          levenshtein(playerNormName, normName) > 3 &&
          playerNormName.length >= 5 &&
          normName.length >= 5
        ) {
          proposal = buildProposal(
            row.rowIndex,
            "conflict",
            0.4,
            null,
            `Mismo betaId (${betaId}) pero nombre distinto: "${player.displayName}" vs "${row.nameRaw}"`,
            candidates.map((c) => ({
              playerId: c.id,
              displayName: c.displayName,
              score: 0.4,
            }))
          );
          stats.conflicts++;
        } else {
          proposal = buildProposal(
            row.rowIndex,
            "exact_id",
            1.0,
            player,
            `Coincidencia exacta por betaId ${betaId}`
          );
          stats.exactId++;
        }
      } else {
        // Varios jugadores con el mismo betaId → conflicto de datos
        proposal = buildProposal(
          row.rowIndex,
          "conflict",
          0.3,
          null,
          `Varios jugadores comparten betaId ${betaId}`,
          candidates.map((c) => ({
            playerId: c.id,
            displayName: c.displayName,
            score: 0.3,
          }))
        );
        stats.conflicts++;
      }
    }
    // 2. nombre + club exactos
    else if (normName && byNormNameClub.has(`${normName}|${normClub}`)) {
      const candidates = byNormNameClub.get(`${normName}|${normClub}`)!;
      if (candidates.length === 1) {
        proposal = buildProposal(
          row.rowIndex,
          "exact_name",
          0.95,
          candidates[0],
          `Nombre + club exactos: "${row.nameRaw}" / ${row.clubRaw}`
        );
        stats.exactName++;
      } else {
        proposal = buildProposal(
          row.rowIndex,
          "conflict",
          0.5,
          null,
          `Varios jugadores con mismo nombre+club`,
          candidates.map((c) => ({
            playerId: c.id,
            displayName: c.displayName,
            score: 0.5,
          }))
        );
        stats.conflicts++;
      }
    }
    // 3. nombre único exacto
    else if (normName && byNormName.has(normName)) {
      const candidates = byNormName.get(normName)!;
      if (candidates.length === 1) {
        proposal = buildProposal(
          row.rowIndex,
          "exact_name",
          0.85,
          candidates[0],
          `Nombre único exacto: "${row.nameRaw}"`
        );
        stats.exactName++;
      } else {
        proposal = buildProposal(
          row.rowIndex,
          "conflict",
          0.5,
          null,
          `Varios jugadores con el mismo nombre normalizado`,
          candidates.map((c) => ({
            playerId: c.id,
            displayName: c.displayName,
            score: 0.5,
          }))
        );
        stats.conflicts++;
      }
    }
    // 4. Fuzzy
    else if (normName.length >= 8) {
      const fuzzyCandidates: Array<{
        player: ExistingPlayer;
        dist: number;
      }> = [];

      for (const p of existingPlayers) {
        const pn = p.normalizedName || normalizeName(p.displayName);
        if (!pn || pn.length < 6) continue;
        const dist = levenshtein(normName, pn);
        if (dist <= 2) {
          fuzzyCandidates.push({ player: p, dist });
        }
      }

      if (fuzzyCandidates.length === 1) {
        const { player, dist } = fuzzyCandidates[0];
        const confidence = dist === 0 ? 0.8 : dist === 1 ? 0.75 : 0.7;
        proposal = buildProposal(
          row.rowIndex,
          "fuzzy_name",
          confidence,
          player,
          `Candidato fuzzy (distancia ${dist}): "${player.displayName}"`,
          [
            {
              playerId: player.id,
              displayName: player.displayName,
              score: confidence,
            },
          ]
        );
        stats.fuzzyName++;
      } else if (fuzzyCandidates.length > 1) {
        proposal = buildProposal(
          row.rowIndex,
          "conflict",
          0.4,
          null,
          `Varios candidatos fuzzy`,
          fuzzyCandidates.map(({ player, dist }) => ({
            playerId: player.id,
            displayName: player.displayName,
            score: 1 - dist * 0.15,
          }))
        );
        stats.conflicts++;
      } else {
        proposal = buildProposal(
          row.rowIndex,
          "new",
          1.0,
          null,
          "Jugador no encontrado → crear nuevo"
        );
        stats.newPlayers++;
      }
    }
    // 5. Nuevo
    else {
      proposal = buildProposal(
        row.rowIndex,
        "new",
        1.0,
        null,
        "Jugador no encontrado → crear nuevo"
      );
      stats.newPlayers++;
    }

    matched.push({
      raw: row,
      match: proposal,
      normalized: {
        displayName: row.nameRaw.trim(),
        club: normClub || row.clubRaw.trim(),
        betaId,
      },
    });
  }

  return { rows: matched, stats };
}
