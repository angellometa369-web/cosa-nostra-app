/**
 * POST /api/import/betadomino/confirm
 *
 * Confirma un ImportBatch en estado "preview" dentro de una única
 * transacción Prisma. Requiere admin autenticado.
 *
 * Body: { batchId, fileHash }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ConfirmError, confirmImportBatch } from "@/lib/import/confirmImport";
import { AuthError, authErrorResponse, requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);

    const body = await req.json();
    const { batchId, fileHash } = body as {
      batchId?: string;
      fileHash?: string;
    };

    if (!batchId || !fileHash) {
      return NextResponse.json(
        { error: "batchId y fileHash son obligatorios" },
        { status: 400 }
      );
    }

    const result = await confirmImportBatch(prisma, {
      batchId,
      fileHash,
      confirmedById: admin.id,
    });

    return NextResponse.json({
      status: result.status,
      batchId: result.batchId,
      tournamentId: result.tournamentId,
      summary: result.summary,
      message: "Importación confirmada. Torneo y ranking actualizados.",
      confirmedBy: { id: admin.id, email: admin.email },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      const { body, status } = authErrorResponse(error);
      return NextResponse.json(body, { status });
    }
    if (error instanceof ConfirmError) {
      return NextResponse.json(
        {
          error: error.message,
          details: error.details,
        },
        { status: error.status }
      );
    }
    console.error("[import/confirm] Error:", error);
    const message =
      error instanceof Error ? error.message : "Error interno al confirmar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
