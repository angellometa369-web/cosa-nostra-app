/**
 * GET  /api/import/betadomino/[batchId]  → cargar batch + decisions
 * DELETE /api/import/betadomino/[batchId] → eliminar preview (solo status=preview)
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
      include: {
        decisions: { orderBy: { rowIndex: "asc" } },
      },
    });

    if (!batch) {
      return NextResponse.json({ error: "Batch no encontrado" }, { status: 404 });
    }

    const stats = batch.statsJson ? JSON.parse(batch.statsJson) : {};

    return NextResponse.json({
      batchId: batch.id,
      status: batch.status,
      tournament: {
        name: batch.tournamentName,
        date: batch.tournamentDate,
        roundNumber: batch.roundNumber,
        type: batch.detectedType,
        externalKey: batch.externalKey,
      },
      stats,
      file: {
        originalFilename: batch.originalFilename,
        fileHash: batch.fileHash,
      },
      notes: batch.notes,
      createdAt: batch.createdAt,
      confirmedAt: batch.confirmedAt,
      rows: batch.decisions.map((d) => {
        const raw = JSON.parse(d.rawDataJson);
        return {
          decisionId: d.id,
          rowIndex: d.rowIndex,
          pos: raw.pos,
          nameRaw: raw.nameRaw,
          betaId: raw.betaId,
          clubRaw: raw.clubRaw,
          pj: raw.pj,
          pg: raw.pg,
          pp: raw.pp,
          efe: raw.efe,
          avg: raw.avg,
          matchStatus: d.matchStatus,
          confidence: d.confidence,
          proposedPlayerId: d.proposedPlayerId,
          needsReview:
            d.matchStatus === "fuzzy_name" || d.matchStatus === "conflict",
          action: d.action || null,
          selectedPlayerId: d.selectedPlayerId,
        };
      }),
      decisions: batch.decisions.map((d) => ({
        id: d.id,
        rowIndex: d.rowIndex,
        matchStatus: d.matchStatus,
        proposedPlayerId: d.proposedPlayerId,
        confidence: d.confidence,
        action: d.action || null,
        selectedPlayerId: d.selectedPlayerId,
        rawData: JSON.parse(d.rawDataJson),
        decidedAt: d.decidedAt,
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      const { body, status } = authErrorResponse(error);
      return NextResponse.json(body, { status });
    }
    console.error("[import/batch GET]", error);
    return NextResponse.json({ error: "Error al cargar el batch" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin(req);
    const { batchId } = await ctx.params;

    const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
    if (!batch) {
      return NextResponse.json({ error: "Batch no encontrado" }, { status: 404 });
    }
    if (batch.status !== "preview") {
      return NextResponse.json(
        { error: "Solo se pueden eliminar batches en estado preview" },
        { status: 409 }
      );
    }

    await prisma.importBatch.delete({ where: { id: batchId } });
    return NextResponse.json({ ok: true, deleted: batchId });
  } catch (error) {
    if (error instanceof AuthError) {
      const { body, status } = authErrorResponse(error);
      return NextResponse.json(body, { status });
    }
    console.error("[import/batch DELETE]", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
