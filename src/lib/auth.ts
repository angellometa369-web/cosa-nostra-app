/**
 * Autenticación por sesión opaca (Bearer token).
 * Token almacenado en Session (Prisma); nunca se expone el passwordHash.
 */

import { randomBytes } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const SESSION_DAYS = 7;
const ADMIN_ROLES = new Set(["don", "admin"]);

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  alias: string | null;
  role: string;
  playerId: string | null;
};

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export function isAdminRole(role: string | null | undefined): boolean {
  return !!role && ADMIN_ROLES.has(role);
}

export function toAuthUser(user: {
  id: string;
  email: string;
  name: string;
  alias: string | null;
  role: string;
  player?: { id: string } | null;
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    alias: user.alias,
    role: user.role,
    playerId: user.player?.id ?? null,
  };
}

/** Genera token opaco de 64 hex chars */
export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createSession(userId: string): Promise<{
  token: string;
  expires: Date;
}> {
  const token = generateSessionToken();
  const expires = new Date();
  expires.setDate(expires.getDate() + SESSION_DAYS);

  await prisma.session.create({
    data: {
      sessionToken: token,
      userId,
      expires,
    },
  });

  return { token, expires };
}

export async function deleteSession(token: string): Promise<void> {
  try {
    await prisma.session.delete({ where: { sessionToken: token } });
  } catch {
    // ya no existe
  }
}

export async function deleteAllUserSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

/**
 * Extrae Bearer token del header Authorization.
 */
export function extractBearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/**
 * Valida sesión y devuelve usuario. Lanza AuthError si no es válido.
 */
export async function requireAuth(req: NextRequest): Promise<AuthUser> {
  const token = extractBearerToken(req);
  if (!token) {
    throw new AuthError("No autenticado. Envía Authorization: Bearer <token>", 401);
  }

  const session = await prisma.session.findUnique({
    where: { sessionToken: token },
    include: {
      user: { include: { player: { select: { id: true } } } },
    },
  });

  if (!session) {
    throw new AuthError("Sesión inválida o expirada", 401);
  }

  if (session.expires < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    throw new AuthError("Sesión expirada. Vuelve a iniciar sesión", 401);
  }

  return toAuthUser(session.user);
}

/**
 * Requiere autenticación + rol admin (don | admin).
 */

/**
 * Sesión opcional: devuelve usuario o null (no lanza).
 */
export async function getOptionalUser(req: NextRequest): Promise<AuthUser | null> {
  try {
    return await requireAuth(req);
  } catch {
    return null;
  }
}

export async function requireAdmin(req: NextRequest): Promise<AuthUser> {
  const user = await requireAuth(req);
  if (!isAdminRole(user.role)) {
    throw new AuthError("Se requiere rol de administrador", 403);
  }
  return user;
}

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthError) {
    return { body: { error: error.message }, status: error.status };
  }
  console.error("[auth]", error);
  return { body: { error: "Error de autenticación" }, status: 500 };
}
