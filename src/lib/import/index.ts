/**
 * API pública del módulo de importación BetaDomino → GFCN
 */

export type {
  DetectedType,
  MatchStatus,
  DecisionAction,
  RawPlayerRow,
  ParsedTournamentMeta,
  ParseResult,
  ExistingPlayer,
  MatchProposal,
  MatchedRow,
  MatchResult,
} from "./types";

export {
  normalizeName,
  normalizeId,
  normalizeClub,
  parseAvg,
  buildExternalKey,
  parseFilenameMeta,
} from "./normalize";

export { parseBetaDominoFile, getExternalKeyFromParse } from "./parser";
export { matchPlayers } from "./matcher";
export {
  buildImportPreview,
  computeFileHash,
  validateDecisionsForConfirm,
} from "./buildBatch";
export type {
  ImportBatchDraft,
  ImportDecisionDraft,
  PreviewPayload,
} from "./buildBatch";

export { confirmImportBatch, ConfirmError } from "./confirmImport";
export type { ConfirmResult } from "./confirmImport";
