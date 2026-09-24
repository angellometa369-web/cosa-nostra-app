/**
 * GET /api/auth/me
 * Authorization: Bearer <token>
 * Devuelve el usuario de la sesión activa.
 */

import { NextRequest, NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof AuthError) {
      const { body, status } = authErrorResponse(error);
      return NextResponse.json(body, { status });
    }
    console.error("[auth/me]", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
