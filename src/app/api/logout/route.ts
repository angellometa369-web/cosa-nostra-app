/**
 * POST /api/logout
 * Authorization: Bearer <token>
 * Invalida la sesión actual.
 */

import { NextRequest, NextResponse } from "next/server";
import { deleteSession, extractBearerToken } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const token = extractBearerToken(req);
    if (token) {
      await deleteSession(token);
    }
    return NextResponse.json({ ok: true, message: "Sesión cerrada" });
  } catch (error) {
    console.error("[logout]", error);
    return NextResponse.json({ ok: true, message: "Sesión cerrada" });
  }
}
