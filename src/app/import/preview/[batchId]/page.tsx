import { notFound } from "next/navigation";
import PreviewClient from "@/components/import/PreviewClient";

export const dynamic = "force-dynamic";

async function loadBatch(batchId: string) {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://127.0.0.1:3000";

  try {
    const res = await fetch(`${base}/api/import/betadomino/${batchId}`, {
      cache: "no-store",
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      // Fallback: intentar vía prisma directo si el fetch interno falla
      return null;
    }
    return res.json();
  } catch {
    return null;
  }
}

/** Carga directa por Prisma (más fiable en SSR local) */
async function loadBatchFromDb(batchId: string) {
  try {
    const { prisma } = await import("@/lib/prisma");
    const batch = await prisma.importBatch.findUnique({
      where: { id: batchId },
      include: { decisions: { orderBy: { rowIndex: "asc" } } },
    });
    if (!batch) return null;

    const stats = batch.statsJson ? JSON.parse(batch.statsJson) : {};
    return {
      batchId: batch.id,
      status: batch.status,
      tournament: {
        name: batch.tournamentName,
        date: batch.tournamentDate,
        roundNumber: batch.roundNumber,
        type: batch.detectedType,
        externalKey: batch.externalKey,
      },
      stats: {
        players: stats.players ?? batch.decisions.length,
        recognized: stats.recognized ?? 0,
        new: stats.new ?? 0,
        conflicts: stats.conflicts ?? 0,
        fuzzy: stats.fuzzy ?? 0,
      },
      file: {
        originalFilename: batch.originalFilename,
        fileHash: batch.fileHash,
      },
      notes: batch.notes,
      rows: batch.decisions.map((d) => {
        const raw = JSON.parse(d.rawDataJson);
        return {
          decisionId: d.id,
          rowIndex: d.rowIndex,
          pos: raw.pos,
          nameRaw: raw.nameRaw,
          betaId: raw.betaId,
          clubRaw: raw.clubRaw,
          pj: raw.pj ?? 0,
          pg: raw.pg ?? 0,
          pp: raw.pp ?? 0,
          efe: raw.efe ?? 0,
          avg: raw.avg ?? 0,
          matchStatus: d.matchStatus,
          confidence: d.confidence,
          proposedPlayerId: d.proposedPlayerId,
          needsReview:
            d.matchStatus === "fuzzy_name" || d.matchStatus === "conflict",
          action: d.action || null,
          selectedPlayerId: d.selectedPlayerId,
        };
      }),
    };
  } catch {
    return null;
  }
}

export default async function PreviewBatchPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;

  let data = await loadBatchFromDb(batchId);
  if (!data) data = await loadBatch(batchId);
  if (!data) notFound();

  return <PreviewClient initial={data} />;
}
