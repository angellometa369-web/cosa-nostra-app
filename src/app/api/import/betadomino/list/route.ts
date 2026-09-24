/**
 * GET /api/import/betadomino/list
 *
 * Lista ImportBatch ordenados por fecha (más recientes primero).
 * Query opcional: ?status=preview|confirmed|rejected&limit=50
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, authErrorResponse, requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const limit = Math.min(Number(searchParams.get("limit") || 50), 100);

    const where =
      status && ["preview", "confirmed", "rejected", "error"].includes(status)
        ? { status }
        : {};

    const batches = await prisma.importBatch.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        originalFilename: true,
        fileHash: true,
        externalKey: true,
        detectedType: true,
        tournamentName: true,
        tournamentDate: true,
        roundNumber: true,
        status: true,
        statsJson: true,
        notes: true,
        createdAt: true,
        confirmedAt: true,
        confirmedById: true,
        _count: { select: { decisions: true } },
      },
    });

    return NextResponse.json({
      batches: batches.map((b) => {
        let stats: Record<string, unknown> = {};
        try {
          stats = b.statsJson ? JSON.parse(b.statsJson) : {};
        } catch {
          /* ignore */
        }
        return {
          batchId: b.id,
          originalFilename: b.originalFilename,
          fileHash: b.fileHash,
          externalKey: b.externalKey,
          type: b.detectedType,
          tournamentName: b.tournamentName,
          tournamentDate: b.tournamentDate,
          roundNumber: b.roundNumber,
          status: b.status,
          stats,
          notes: b.notes,
          decisionCount: b._count.decisions,
          createdAt: b.createdAt,
          confirmedAt: b.confirmedAt,
          confirmedById: b.confirmedById,
        };
      }),
      total: batches.length,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      const { body, status } = authErrorResponse(error);
      return NextResponse.json(body, { status });
    }
    console.error("[import/list]", error);
    return NextResponse.json(
      { error: "Error al listar importaciones" },
      { status: 500 }
    );
  }
}
