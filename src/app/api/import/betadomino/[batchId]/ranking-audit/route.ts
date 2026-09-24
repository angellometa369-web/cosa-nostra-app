/**
 * GET /api/import/betadomino/[batchId]/ranking-audit
 *
 * Devuelve los cambios de ranking producidos por una importación confirmada.
 * Responde: "¿qué cambió cuando importamos este torneo?"
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, authErrorResponse, requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ batchId: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin(req);
    const { batchId } = await ctx.params;

    const batch = await prisma.importBatch.findUnique({
      where: { id: batchId },
      select: {
        id: true,
        status: true,
        tournamentName: true,
        tournamentDate: true,
        detectedType: true,
        confirmedAt: true,
        externalKey: true,
      },
    });

    if (!batch) {
      return NextResponse.json({ error: "Batch no encontrado" }, { status: 404 });
    }

    if (batch.status !== "confirmed") {
      return NextResponse.json(
        {
          error: "El batch aún no está confirmado; no hay auditoría de ranking",
          status: batch.status,
        },
        { status: 409 }
      );
    }

    const changes = await prisma.rankingChange.findMany({
      where: { importBatchId: batchId },
      include: {
        player: {
          select: {
            id: true,
            displayName: true,
            club: true,
          },
        },
      },
      orderBy: [{ newPosition: "asc" }],
    });

    const climbed = changes.filter(
      (c) => c.deltaPosition != null && c.deltaPosition > 0
    ).length;
    const dropped = changes.filter(
      (c) => c.deltaPosition != null && c.deltaPosition < 0
    ).length;
    const debut = changes.filter((c) => c.previousPosition == null).length;
    const unchanged = changes.filter((c) => c.deltaPosition === 0).length;

    return NextResponse.json({
      batchId: batch.id,
      tournament: {
        name: batch.tournamentName,
        date: batch.tournamentDate,
        type: batch.detectedType,
        externalKey: batch.externalKey,
      },
      confirmedAt: batch.confirmedAt,
      stats: {
        totalTracked: changes.length,
        climbed,
        dropped,
        debut,
        unchanged,
      },
      changes: changes.map((c) => ({
        playerId: c.playerId,
        displayName: c.player.displayName,
        club: c.player.club,
        previousPosition: c.previousPosition,
        newPosition: c.newPosition,
        deltaPosition: c.deltaPosition,
        previousWins: c.previousWins,
        newWins: c.newWins,
        previousLosses: c.previousLosses,
        newLosses: c.newLosses,
        previousEfficiency: c.previousEfficiency,
        newEfficiency: c.newEfficiency,
        previousPoints: c.previousPoints,
        newPoints: c.newPoints,
        movement:
          c.previousPosition == null
            ? "debut"
            : c.deltaPosition != null && c.deltaPosition > 0
              ? "up"
              : c.deltaPosition != null && c.deltaPosition < 0
                ? "down"
                : "same",
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      const { body, status } = authErrorResponse(error);
      return NextResponse.json(body, { status });
    }
    console.error("[ranking-audit]", error);
    return NextResponse.json(
      { error: "Error al obtener la auditoría de ranking" },
      { status: 500 }
    );
  }
}
