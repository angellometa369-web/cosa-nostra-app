import { NextRequest, NextResponse } from "next/server";

/**
 * CORS para que la PWA (otro origen) pueda llamar a /api/*.
 * En producción restringe con ALLOWED_ORIGINS (coma-separado).
 */
export function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const origin = req.headers.get("origin") || "";
  const allowedEnv = process.env.ALLOWED_ORIGINS || "";
  const allowedList = allowedEnv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Dev: permitir cualquier origin local; prod: lista blanca o mismo origin
  const isDev = process.env.NODE_ENV !== "production";
  const allowOrigin =
    isDev ||
    allowedList.length === 0 ||
    allowedList.includes(origin) ||
    allowedList.includes("*")
      ? origin || "*"
      : allowedList[0] || "*";

  if (req.method === "OPTIONS") {
    const res = new NextResponse(null, { status: 204 });
    res.headers.set("Access-Control-Allow-Origin", allowOrigin);
    res.headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
    res.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With"
    );
    res.headers.set("Access-Control-Max-Age", "86400");
    if (allowOrigin !== "*") {
      res.headers.set("Access-Control-Allow-Credentials", "true");
    }
    return res;
  }

  const res = NextResponse.next();
  res.headers.set("Access-Control-Allow-Origin", allowOrigin);
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  res.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );
  if (allowOrigin !== "*") {
    res.headers.set("Access-Control-Allow-Credentials", "true");
  }
  return res;
}

export const config = {
  matcher: "/api/:path*",
};
