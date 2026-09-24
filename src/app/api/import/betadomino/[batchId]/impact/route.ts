/**
 * GET /api/import/betadomino/[batchId]/impact
 *
 * Análisis de impacto de un evento de importación confirmado:
 * - Volumen (jugadores, resultados, debuts)
 * - Movimiento de ranking (subidas / bajadas / estabilidad)
 * - Concentración del impacto (top movers)
 * - Efecto en el podio y top 10
 * - Distribución por club
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, authErrorResponse, requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ batchId: string }> };

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin(req);
    const { batchId } = await ctx.params;

    const batch = await prisma.importBatch.findUnique({
      where: { id: batchId },
      include: {
        tournament: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
            startDate: true,
            roundCount: true,
          },
        },
        decisions: { select: { action: true, matchStatus: true } },
      },
    });

    if (!batch) {
      return NextResponse.json({ error: "Batch no encontrado" }, { status: 404 });
    }
    if (batch.status !== "confirmed") {
      return NextResponse.json(
        {
          error: "Solo se analiza impacto de importaciones confirmadas",
          status: batch.status,
        },
        { status: 409 }
      );
    }

    const [changes, results] = await Promise.all([
      prisma.rankingChange.findMany({
        where: { importBatchId: batchId },
        include: {
          player: {
            select: {
              id: true,
              displayName: true,
              club: true,
              wins: true,
              losses: true,
              efficiency: true,
            },
          },
        },
        orderBy: { newPosition: "asc" },
      }),
      batch.tournament
        ? prisma.tournamentResult.findMany({
            where: { tournamentId: batch.tournament.id },
            include: {
              player: {
                select: { id: true, displayName: true, club: true },
              },
            },
            orderBy: { position: "asc" },
          })
        : Promise.resolve([]),
    ]);

    // --- Clasificación de movimientos ---
    const withDelta = changes.filter((c) => c.deltaPosition != null);
    const climbed = withDelta.filter((c) => (c.deltaPosition ?? 0) > 0);
    const dropped = withDelta.filter((c) => (c.deltaPosition ?? 0) < 0);
    const stable = withDelta.filter((c) => c.deltaPosition === 0);
    const debuts = changes.filter((c) => c.previousPosition == null);

    const climbDeltas = climbed.map((c) => c.deltaPosition ?? 0);
    const dropDeltas = dropped.map((c) => Math.abs(c.deltaPosition ?? 0));

    // --- Impacto en podio / top 10 ---
    const prevTop10 = changes
      .filter((c) => c.previousPosition != null && c.previousPosition <= 10)
      .map((c) => ({
        playerId: c.playerId,
        displayName: c.player.displayName,
        previousPosition: c.previousPosition!,
        newPosition: c.newPosition,
        deltaPosition: c.deltaPosition,
      }));

    const newTop10 = changes
      .filter((c) => c.newPosition <= 10)
      .map((c) => ({
        playerId: c.playerId,
        displayName: c.player.displayName,
        previousPosition: c.previousPosition,
        newPosition: c.newPosition,
        deltaPosition: c.deltaPosition,
        isDebut: c.previousPosition == null,
        enteredTop10:
          c.previousPosition == null || c.previousPosition > 10,
        leftTop10:
          c.previousPosition != null &&
          c.previousPosition <= 10 &&
          c.newPosition > 10,
      }));

    const podiumBefore = changes
      .filter((c) => c.previousPosition != null && c.previousPosition <= 3)
      .sort((a, b) => (a.previousPosition ?? 99) - (b.previousPosition ?? 99));
    const podiumAfter = changes
      .filter((c) => c.newPosition <= 3)
      .sort((a, b) => a.newPosition - b.newPosition);

    const podiumChanged =
      podiumBefore.length !== podiumAfter.length ||
      podiumBefore.some(
        (p, i) => p.playerId !== podiumAfter[i]?.playerId
      );

    // --- Por club ---
    const byClub = new Map<
      string,
      {
        club: string;
        players: number;
        avgDelta: number;
        totalClimb: number;
        totalDrop: number;
        debuts: number;
      }
    >();

    for (const c of changes) {
      const club = c.player.club || "Sin club";
      if (!byClub.has(club)) {
        byClub.set(club, {
          club,
          players: 0,
          avgDelta: 0,
          totalClimb: 0,
          totalDrop: 0,
          debuts: 0,
        });
      }
      const row = byClub.get(club)!;
      row.players++;
      if (c.previousPosition == null) row.debuts++;
      const d = c.deltaPosition ?? 0;
      if (d > 0) row.totalClimb += d;
      if (d < 0) row.totalDrop += Math.abs(d);
    }
    for (const row of byClub.values()) {
      const clubChanges = changes.filter(
        (c) => (c.player.club || "Sin club") === row.club
      );
      const deltas = clubChanges
        .map((c) => c.deltaPosition)
        .filter((d): d is number => d != null);
      row.avgDelta = Math.round(avg(deltas) * 10) / 10;
    }

    // --- Participantes del torneo vs ranking general ---
    const participantIds = new Set(results.map((r) => r.playerId));
    const participantChanges = changes.filter((c) =>
      participantIds.has(c.playerId)
    );
    const collateralChanges = changes.filter(
      (c) => !participantIds.has(c.playerId)
    );

    // --- Decisiones del preview ---
    const decisionStats = {
      acceptMatch: batch.decisions.filter((d) => d.action === "accept_match")
        .length,
      createNew: batch.decisions.filter((d) => d.action === "create_new")
        .length,
      linkExisting: batch.decisions.filter((d) => d.action === "link_existing")
        .length,
      ignore: batch.decisions.filter((d) => d.action === "ignore").length,
      total: batch.decisions.length,
    };

    // --- Resultados del torneo (podio del evento) ---
    const tournamentPodium = results.slice(0, 5).map((r) => ({
      position: r.position,
      displayName: r.player.displayName,
      club: r.player.club,
      pg: r.pg,
      pp: r.pp,
      efe: r.efe,
      avg: r.avg,
    }));

    // --- Índice de volatilidad ---
    // Media de |delta| entre quienes tenían posición previa
    const absDeltas = withDelta.map((c) => Math.abs(c.deltaPosition ?? 0));
    const volatility =
      absDeltas.length > 0
        ? Math.round(avg(absDeltas) * 100) / 100
        : 0;

    // --- Top movers ---
    const topClimbers = [...climbed]
      .sort((a, b) => (b.deltaPosition ?? 0) - (a.deltaPosition ?? 0))
      .slice(0, 10)
      .map((c) => ({
        playerId: c.playerId,
        displayName: c.player.displayName,
        club: c.player.club,
        from: c.previousPosition,
        to: c.newPosition,
        delta: c.deltaPosition,
        winsAdded: (c.newWins ?? 0) - (c.previousWins ?? 0),
      }));

    const topDroppers = [...dropped]
      .sort((a, b) => (a.deltaPosition ?? 0) - (b.deltaPosition ?? 0))
      .slice(0, 10)
      .map((c) => ({
        playerId: c.playerId,
        displayName: c.player.displayName,
        club: c.player.club,
        from: c.previousPosition,
        to: c.newPosition,
        delta: c.deltaPosition,
      }));

    return NextResponse.json({
      batchId: batch.id,
      tournament: {
        id: batch.tournament?.id ?? null,
        name: batch.tournamentName,
        date: batch.tournamentDate,
        type: batch.detectedType,
        roundNumber: batch.roundNumber,
        externalKey: batch.externalKey,
      },
      confirmedAt: batch.confirmedAt,
      file: {
        originalFilename: batch.originalFilename,
        fileHash: batch.fileHash,
      },

      // Resumen ejecutivo
      headline: {
        participants: results.length,
        rankingRowsTracked: changes.length,
        climbed: climbed.length,
        dropped: dropped.length,
        stable: stable.length,
        debuts: debuts.length,
        collateralAffected: collateralChanges.length,
        podiumChanged,
        volatility,
        medianClimb: Math.round(median(climbDeltas) * 10) / 10,
        medianDrop: Math.round(median(dropDeltas) * 10) / 10,
        maxClimb: climbDeltas.length ? Math.max(...climbDeltas) : 0,
        maxDrop: dropDeltas.length ? Math.max(...dropDeltas) : 0,
      },

      decisionStats,
      tournamentPodium,

      podium: {
        before: podiumBefore.map((c) => ({
          position: c.previousPosition,
          displayName: c.player.displayName,
          playerId: c.playerId,
        })),
        after: podiumAfter.map((c) => ({
          position: c.newPosition,
          displayName: c.player.displayName,
          playerId: c.playerId,
          previousPosition: c.previousPosition,
        })),
        changed: podiumChanged,
      },

      top10: {
        previousMembers: prevTop10,
        currentMembers: newTop10,
        entered: newTop10.filter((x) => x.enteredTop10),
        left: newTop10.filter((x) => x.leftTop10),
      },

      topClimbers,
      topDroppers,
      debuts: debuts.slice(0, 15).map((c) => ({
        playerId: c.playerId,
        displayName: c.player.displayName,
        club: c.player.club,
        position: c.newPosition,
      })),

      byClub: Array.from(byClub.values()).sort(
        (a, b) => b.players - a.players
      ),

      impactScope: {
        participantsAffected: participantChanges.length,
        collateralAffected: collateralChanges.length,
        note:
          collateralChanges.length > 0
            ? "Jugadores que no jugaron este torneo pero movieron posición relativa al recalcular el ranking."
            : "Solo se movieron jugadores que participaron en el torneo.",
      },

      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      const { body, status } = authErrorResponse(error);
      return NextResponse.json(body, { status });
    }
    console.error("[impact]", error);
    return NextResponse.json(
      {
        error: "Error al analizar impacto",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
