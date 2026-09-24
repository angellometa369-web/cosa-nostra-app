/**
 * POST /api/import/betadomino/preview
 *
 * 1. Recibe Excel (multipart, campo "file")
 * 2. Parse + Match + buildImportPreview
 * 3. Persiste ImportBatch (status=preview) + ImportDecision[]
 * 4. Devuelve batchId real (cuid) + payload para la UI
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  parseBetaDominoFile,
  matchPlayers,
  buildImportPreview,
  computeFileHash,
  type ExistingPlayer,
} from "@/lib/import";
import { normalizeName, normalizeClub } from "@/lib/import/normalize";
import { AuthError, authErrorResponse, requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadExistingPlayers(): Promise<ExistingPlayer[]> {
  try {
    const clubAliases = await prisma.clubAlias.findMany();
    const aliasMap = new Map<string, string>();
    for (const ca of clubAliases) {
      aliasMap.set(ca.alias, ca.canonical);
    }

    const players = await prisma.player.findMany({
      where: { active: true },
      select: {
        id: true,
        displayName: true,
        normalizedName: true,
        club: true,
        normalizedClub: true,
        externalIdentities: {
          where: { provider: "betadomino" },
          select: { externalId: true },
        },
      },
    });

    return players.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      normalizedName: p.normalizedName || normalizeName(p.displayName),
      club: p.club,
      normalizedClub: p.normalizedClub || normalizeClub(p.club, aliasMap),
      betaIds: p.externalIdentities.map((e) => e.externalId),
    }));
  } catch (err) {
    console.warn("[import/preview] loadExistingPlayers fallback:", err);
    try {
      const players = await prisma.player.findMany({
        where: { active: true },
        select: { id: true, displayName: true },
      });
      return players.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        normalizedName: normalizeName(p.displayName),
        club: null,
        normalizedClub: null,
        betaIds: [],
      }));
    } catch {
      return [];
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'Se requiere un archivo en el campo "file"' },
        { status: 400 }
      );
    }

    const filename = file.name || "upload.xlsx";
    if (!/\.xlsx?$/i.test(filename)) {
      return NextResponse.json(
        { error: "Solo se aceptan archivos .xlsx o .xls" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const fileHash = computeFileHash(arrayBuffer);

    // Idempotencia: reutilizar batch preview existente con el mismo hash
    try {
      const existingBatch = await prisma.importBatch.findUnique({
        where: { fileHash },
        include: { decisions: { orderBy: { rowIndex: "asc" } } },
      });

      if (existingBatch && existingBatch.status === "preview") {
        const stats = existingBatch.statsJson
          ? JSON.parse(existingBatch.statsJson)
          : {};
        return NextResponse.json({
          batchId: existingBatch.id,
          status: existingBatch.status,
          tournament: {
            name: existingBatch.tournamentName,
            date: existingBatch.tournamentDate,
            roundNumber: existingBatch.roundNumber,
            type: existingBatch.detectedType,
            externalKey: existingBatch.externalKey,
          },
          stats,
          file: {
            originalFilename: existingBatch.originalFilename,
            fileHash: existingBatch.fileHash,
          },
          notes: existingBatch.notes,
          rows: existingBatch.decisions.map((d) => {
            const raw = JSON.parse(d.rawDataJson);
            return {
              rowIndex: d.rowIndex,
              pos: raw.pos,
              nameRaw: raw.nameRaw,
              betaId: raw.betaId,
              clubRaw: raw.clubRaw,
              pj: raw.pj,
              pg: raw.pg,
              pp: raw.pp,
              efe: raw.efe,
              avg: raw.avg,
              matchStatus: d.matchStatus,
              confidence: d.confidence,
              proposedPlayerId: d.proposedPlayerId,
              needsReview:
                d.matchStatus === "fuzzy_name" || d.matchStatus === "conflict",
              action: d.action || null,
              selectedPlayerId: d.selectedPlayerId,
              decisionId: d.id,
            };
          }),
          decisions: existingBatch.decisions.map((d) => ({
            id: d.id,
            rowIndex: d.rowIndex,
            matchStatus: d.matchStatus,
            proposedPlayerId: d.proposedPlayerId,
            confidence: d.confidence,
            action: d.action || null,
            selectedPlayerId: d.selectedPlayerId,
            rawData: JSON.parse(d.rawDataJson),
          })),
          reused: true,
        });
      }
    } catch {
      // tablas aún no existen — continuar sin reutilizar
    }

    // 1. Parse
    const parseResult = parseBetaDominoFile(arrayBuffer, { filename });

    if (parseResult.rows.length === 0) {
      return NextResponse.json(
        {
          error: "El archivo no contiene filas de resultados reconocibles",
          warnings: parseResult.warnings,
        },
        { status: 422 }
      );
    }

    // 2. Match
    const existingPlayers = await loadExistingPlayers();
    const matchResult = matchPlayers(parseResult.rows, existingPlayers);

    // 3. Build draft
    const preview = buildImportPreview(parseResult, matchResult, fileHash);

    // 4. Persistir ImportBatch + ImportDecision
    const batch = await prisma.importBatch.create({
      data: {
        source: preview.batch.source,
        originalFilename: preview.batch.originalFilename,
        fileHash: preview.batch.fileHash,
        externalKey: preview.batch.externalKey,
        detectedType: preview.batch.detectedType,
        tournamentName: preview.batch.tournamentName,
        tournamentDate: preview.batch.tournamentDate || "",
        roundNumber: preview.batch.roundNumber,
        status: "preview",
        statsJson: JSON.stringify({
          players: preview.batch.stats.totalPlayers,
          recognized: preview.batch.stats.recognizedPlayers,
          new: preview.batch.stats.newPlayers,
          conflicts: preview.batch.stats.conflicts,
          fuzzy: preview.batch.stats.fuzzyPlayers,
        }),
        notes: preview.batch.notes,
        decisions: {
          create: preview.decisions.map((d) => ({
            rowIndex: d.rowIndex,
            action: d.action ?? "",
            proposedPlayerId: d.proposedPlayerId,
            selectedPlayerId: d.selectedPlayerId,
            confidence: d.confidence,
            matchStatus: d.matchStatus,
            rawDataJson: JSON.stringify(d.rawData),
          })),
        },
      },
      include: {
        decisions: { orderBy: { rowIndex: "asc" } },
      },
    });

    return NextResponse.json({
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
        players: preview.batch.stats.totalPlayers,
        recognized: preview.batch.stats.recognizedPlayers,
        new: preview.batch.stats.newPlayers,
        conflicts: preview.batch.stats.conflicts,
        fuzzy: preview.batch.stats.fuzzyPlayers,
      },
      file: {
        originalFilename: batch.originalFilename,
        fileHash: batch.fileHash,
      },
      notes: batch.notes,
      rows: preview.rows.map((r, i) => ({
        ...r,
        decisionId: batch.decisions[i]?.id ?? null,
      })),
      decisions: batch.decisions.map((d) => ({
        id: d.id,
        rowIndex: d.rowIndex,
        matchStatus: d.matchStatus,
        proposedPlayerId: d.proposedPlayerId,
        confidence: d.confidence,
        action: d.action || null,
        selectedPlayerId: d.selectedPlayerId,
        rawData: JSON.parse(d.rawDataJson),
      })),
      existingPlayersLoaded: existingPlayers.length,
      warnings: parseResult.warnings,
      reused: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      const { body, status } = authErrorResponse(error);
      return NextResponse.json(body, { status });
    }
    console.error("[import/preview] Error:", error);
    const message =
      error instanceof Error ? error.message : "Error interno al procesar el archivo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
