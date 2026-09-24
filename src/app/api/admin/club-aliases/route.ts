import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { normalizeName } from "@/lib/import/normalize";

/**
 * GET /api/admin/club-aliases
 * Lista todos los alias de clubes.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const aliases = await prisma.clubAlias.findMany({
      orderBy: { alias: "asc" },
    });
    return NextResponse.json({ aliases });
  } catch (err) {
    const { body, status } = authErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * POST /api/admin/club-aliases
 * Crea un nuevo alias de club (ej: "S. MENDOZA" -> "S MENDOZA").
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = await req.json();
    const rawAlias = body.alias ? String(body.alias).trim() : "";
    const rawCanonical = body.canonical ? String(body.canonical).trim() : "";

    if (!rawAlias || !rawCanonical) {
      return NextResponse.json(
        { error: "Se requieren 'alias' y 'canonical'" },
        { status: 400 }
      );
    }

    const aliasNorm = normalizeName(rawAlias);
    const canonicalNorm = normalizeName(rawCanonical);

    const clubAlias = await prisma.clubAlias.upsert({
      where: { alias: aliasNorm },
      create: {
        alias: aliasNorm,
        canonical: canonicalNorm,
      },
      update: {
        canonical: canonicalNorm,
      },
    });

    return NextResponse.json({ clubAlias });
  } catch (err) {
    const { body, status } = authErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * DELETE /api/admin/club-aliases
 * Elimina un alias de club por su ID o por su alias.
 */
export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const alias = searchParams.get("alias");

    if (!id && !alias) {
      return NextResponse.json(
        { error: "Se requiere parámetro 'id' o 'alias'" },
        { status: 400 }
      );
    }

    if (id) {
      await prisma.clubAlias.delete({ where: { id } });
    } else if (alias) {
      const aliasNorm = normalizeName(alias);
      await prisma.clubAlias.delete({ where: { alias: aliasNorm } });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const { body, status } = authErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
