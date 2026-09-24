/**
 * POST /api/login
 * Body: { email, password }
 * → { token, expiresAt, user }
 */

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession, toAuthUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email y contraseña son requeridos" },
        { status: 400 }
      );
    }

    // Retraso mínimo anti-timing en fallos (aprox. coste de bcrypt)
    const user = await prisma.user.findUnique({
      where: { email },
      include: { player: { select: { id: true } } },
    });

    const valid =
      user && (await bcrypt.compare(password, user.passwordHash));

    if (!user || !valid) {
      return NextResponse.json(
        { error: "Email o contraseña incorrectos" },
        { status: 401 }
      );
    }

    const { token, expires } = await createSession(user.id);
    const safeUser = toAuthUser(user);

    return NextResponse.json({
      token,
      expiresAt: expires.toISOString(),
      user: safeUser,
    });
  } catch (error) {
    console.error("[login]", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
