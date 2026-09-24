import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authErrorResponse, requireAuth, toAuthUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/user/profile
 * Obtiene la información del perfil del usuario autenticado.
 */
export async function GET(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      include: {
        player: {
          select: {
            id: true,
            displayName: true,
            club: true,
            rankingPoints: true,
            wins: true,
            losses: true,
            efficiency: true,
            tournamentsPlayed: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    return NextResponse.json({
      user: {
        ...toAuthUser(user),
        player: user.player,
      },
    });
  } catch (err) {
    const { body, status } = authErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * PATCH /api/user/profile
 * Actualiza nombre, alias y/o contraseña del usuario autenticado.
 */
export async function PATCH(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const body = await req.json();

    const data: Record<string, unknown> = {};

    if (typeof body.name === "string" && body.name.trim()) {
      data.name = body.name.trim();
    }
    if (body.alias !== undefined) {
      data.alias = typeof body.alias === "string" ? body.alias.trim() : null;
    }
    if (typeof body.password === "string" && body.password.trim()) {
      if (body.password.length < 6) {
        return NextResponse.json(
          { error: "La contraseña debe tener al menos 6 caracteres" },
          { status: 400 }
        );
      }
      data.passwordHash = await bcrypt.hash(body.password, 10);
    }

    if (!Object.keys(data).length) {
      return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: authUser.id },
      data,
      include: {
        player: { select: { id: true } },
      },
    });

    return NextResponse.json({
      ok: true,
      user: toAuthUser(updated),
    });
  } catch (err) {
    const { body, status } = authErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
