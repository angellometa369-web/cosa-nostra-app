/**
 * Construye ImportBatch + ImportDecision a partir del resultado
 * de parse + match. No escribe en base de datos.
 */

import type {
  DecisionAction,
  MatchResult,
  MatchStatus,
  ParseResult,
} from "./types";
import { getExternalKeyFromParse } from "./parser";
import { createHash } from "crypto";

export interface ImportBatchDraft {
  // Identidad
  source: "betadomino";
  originalFilename: string;
  fileHash: string;
  externalKey: string;
  detectedType: "individual" | "parejas";
  tournamentName: string;
  tournamentDate: string | null;
  roundNumber: number | null;
  status: "preview";

  stats: {
    totalPlayers: number;
    recognizedPlayers: number;
    newPlayers: number;
    conflicts: number;
    fuzzyPlayers: number;
    rowsProcessed: number;
  };

  notes: string | null;
}

export interface ImportDecisionDraft {
  rowIndex: number;
  matchStatus: MatchStatus;
  proposedPlayerId: string | null;
  proposedDisplayName: string | null;
  confidence: number;
  action: DecisionAction | null; // null = pendiente de decisión admin
  selectedPlayerId: string | null;
  rawData: {
    pos: number;
    nameRaw: string;
    betaId: string | null;
    clubRaw: string;
    pj: number;
    pg: number;
    pp: number;
    efe: number;
    pf: number;
    pc: number;
    pm: number;
    avg: number;
    sanctions: number | null;
    pairId?: string;
  };
  reason: string;
}

export interface PreviewPayload {
  batch: ImportBatchDraft;
  decisions: ImportDecisionDraft[];
  /** Filas listas para la UI de preview */
  rows: Array<{
    rowIndex: number;
    pos: number;
    nameRaw: string;
    betaId: string | null;
    clubRaw: string;
    pj: number;
    pg: number;
    pp: number;
    efe: number;
    avg: number;
    matchStatus: MatchStatus;
    confidence: number;
    proposedPlayerId: string | null;
    proposedDisplayName: string | null;
    reason: string;
    needsReview: boolean;
    action: DecisionAction | null;
  }>;
}

/** SHA-256 del contenido del archivo */
export function computeFileHash(data: ArrayBuffer | Buffer | Uint8Array): string {
  const buf = Buffer.isBuffer(data)
    ? data
    : Buffer.from(data instanceof ArrayBuffer ? data : data.buffer);
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Construye el draft de ImportBatch + decisiones a partir de
 * ParseResult + MatchResult + hash del archivo.
 */
export function buildImportPreview(
  parseResult: ParseResult,
  matchResult: MatchResult,
  fileHash: string
): PreviewPayload {
  const externalKey = getExternalKeyFromParse(parseResult);

  const recognized =
    matchResult.stats.exactId + matchResult.stats.exactName;
  const conflicts = matchResult.stats.conflicts;
  const fuzzy = matchResult.stats.fuzzyName;
  const newPlayers = matchResult.stats.newPlayers;

  const batch: ImportBatchDraft = {
    source: "betadomino",
    originalFilename: parseResult.tournament.sourceFilename,
    fileHash,
    externalKey,
    detectedType: parseResult.detectedType,
    tournamentName: parseResult.tournament.name,
    tournamentDate: parseResult.tournament.date,
    roundNumber: parseResult.tournament.roundNumber,
    status: "preview",
    stats: {
      totalPlayers: matchResult.stats.total,
      recognizedPlayers: recognized,
      newPlayers,
      conflicts,
      fuzzyPlayers: fuzzy,
      rowsProcessed: matchResult.stats.total,
    },
    notes: parseResult.warnings.length
      ? parseResult.warnings.join(" | ")
      : null,
  };

  const decisions: ImportDecisionDraft[] = matchResult.rows.map((mr) => {
    // Auto-proponer acción para casos seguros (el admin aún puede cambiar)
    let action: DecisionAction | null = null;
    if (mr.match.status === "exact_id" || mr.match.status === "exact_name") {
      action = "accept_match";
    } else if (mr.match.status === "new") {
      action = "create_new";
    }
    // fuzzy_name y conflict quedan en null → requieren decisión explícita

    return {
      rowIndex: mr.raw.rowIndex,
      matchStatus: mr.match.status,
      proposedPlayerId: mr.match.proposedPlayerId,
      proposedDisplayName: mr.match.proposedDisplayName,
      confidence: mr.match.confidence,
      action,
      selectedPlayerId:
        action === "accept_match" ? mr.match.proposedPlayerId : null,
      rawData: {
        pos: mr.raw.pos,
        nameRaw: mr.raw.nameRaw,
        betaId: mr.raw.betaId,
        clubRaw: mr.raw.clubRaw,
        pj: mr.raw.pj,
        pg: mr.raw.pg,
        pp: mr.raw.pp,
        efe: mr.raw.efe,
        pf: mr.raw.pf,
        pc: mr.raw.pc,
        pm: mr.raw.pm,
        avg: mr.raw.avg,
        sanctions: mr.raw.sanctions,
        pairId: mr.raw.pairId,
      },
      reason: mr.match.reason,
    };
  });

  const rows = decisions.map((d) => ({
    rowIndex: d.rowIndex,
    pos: d.rawData.pos,
    nameRaw: d.rawData.nameRaw,
    betaId: d.rawData.betaId,
    clubRaw: d.rawData.clubRaw,
    pj: d.rawData.pj,
    pg: d.rawData.pg,
    pp: d.rawData.pp,
    efe: d.rawData.efe,
    avg: d.rawData.avg,
    matchStatus: d.matchStatus,
    confidence: d.confidence,
    proposedPlayerId: d.proposedPlayerId,
    proposedDisplayName: d.proposedDisplayName,
    reason: d.reason,
    needsReview:
      d.matchStatus === "fuzzy_name" || d.matchStatus === "conflict",
    action: d.action,
  }));

  return { batch, decisions, rows };
}

/**
 * Valida que un conjunto de decisiones esté listo para confirmar.
 * Devuelve lista de errores (vacía = OK).
 */
export function validateDecisionsForConfirm(
  decisions: ImportDecisionDraft[]
): string[] {
  const errors: string[] = [];

  for (const d of decisions) {
    if (d.matchStatus === "fuzzy_name" || d.matchStatus === "conflict") {
      if (!d.action) {
        errors.push(
          `Fila ${d.rowIndex} (${d.rawData.nameRaw}): requiere decisión del administrador`
        );
      }
    }

    if (d.action === "accept_match" || d.action === "link_existing") {
      if (!d.selectedPlayerId) {
        errors.push(
          `Fila ${d.rowIndex} (${d.rawData.nameRaw}): action=${d.action} pero falta selectedPlayerId`
        );
      }
    }

    if (d.action === "create_new" || d.action === "ignore") {
      // OK sin selectedPlayerId
    }
  }

  return errors;
}
