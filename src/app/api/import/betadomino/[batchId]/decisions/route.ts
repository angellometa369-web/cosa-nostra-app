/**
 * PATCH /api/import/betadomino/[batchId]/decisions
 *
 * Actualiza una o varias ImportDecision del batch (solo status=preview).
 * Body:
 * {
 *   decisions: [
 *     { id: "...", action: "accept_match"|"create_new"|"link_existing"|"ignore", selectedPlayerId?: string }
 *   ]
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, authErrorResponse, requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ batchId: string }> };

const VALID_ACTIONS = new Set([
  "accept_match",
  "create_new",
  "link_existing",
  "ignore",
]);

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const admin = await requireAdmin(req);
    const { batchId } = await ctx.params;
    const body = await req.json();

    const batch = await prisma.importBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      return NextResponse.json({ error: "Batch no encontrado" }, { status: 404 });
    }
    if (batch.status !== "preview") {
      return NextResponse.json(
        { error: "Solo se pueden modificar decisions de un batch en preview" },
        { status: 409 }
      );
    }

    const items = body?.decisions as Array<{
      id: string;
      action: string;
      selectedPlayerId?: string | null;
    }>;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Se requiere decisions[]" },
        { status: 400 }
      );
    }

    const updated = [];

    for (const item of items) {
      if (!item.id || !VALID_ACTIONS.has(item.action)) {
        return NextResponse.json(
          {
            error: `Decisión inválida: id=${item.id} action=${item.action}`,
          },
          { status: 400 }
        );
      }

      if (
        (item.action === "accept_match" || item.action === "link_existing") &&
        !item.selectedPlayerId
      ) {
        return NextResponse.json(
          {
            error: `action=${item.action} requiere selectedPlayerId (decision ${item.id})`,
          },
          { status: 400 }
        );
      }

      const row = await prisma.importDecision.update({
        where: { id: item.id },
        data: {
          action: item.action,
          selectedPlayerId:
            item.action === "create_new" || item.action === "ignore"
              ? null
              : item.selectedPlayerId ?? null,
          decidedById: admin.id,
          decidedAt: new Date(),
        },
      });

      // Seguridad: la decision debe pertenecer a este batch
      if (row.importBatchId !== batchId) {
        return NextResponse.json(
          { error: `Decision ${item.id} no pertenece al batch` },
          { status: 403 }
        );
      }

      updated.push({
        id: row.id,
        action: row.action,
        selectedPlayerId: row.selectedPlayerId,
        decidedAt: row.decidedAt,
      });
    }

    return NextResponse.json({
      batchId,
      updated: updated.length,
      decisions: updated,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      const { body, status } = authErrorResponse(error);
      return NextResponse.json(body, { status });
    }
    console.error("[import/decisions PATCH]", error);
    return NextResponse.json(
      { error: "Error al actualizar decisiones" },
      { status: 500 }
    );
  }
}
