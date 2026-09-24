import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ error: "Endpoint no disponible" }, { status: 404 });
}
