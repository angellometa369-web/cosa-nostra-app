/**
 * Tipos del sistema de importación BetaDomino → GFCN
 */

export type DetectedType = "individual" | "parejas";

export type MatchStatus =
  | "exact_id"
  | "exact_name"
  | "fuzzy_name"
  | "new"
  | "conflict";

export type DecisionAction =
  | "accept_match"
  | "create_new"
  | "link_existing"
  | "ignore";

/** Fila cruda parseada desde el Excel */
export interface RawPlayerRow {
  rowIndex: number;
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
  avg: number; // 0–1
  sanctions: number | null;
  // Solo parejas
  pairId?: string;
  partnerNameRaw?: string;
  partnerBetaId?: string;
}

export interface ParsedTournamentMeta {
  name: string;
  date: string | null; // YYYY-MM-DD
  roundNumber: number | null;
  sourceFilename: string;
}

export interface ParseResult {
  detectedType: DetectedType;
  tournament: ParsedTournamentMeta;
  rows: RawPlayerRow[];
  warnings: string[];
}

/** Jugador existente en GFCN (lo mínimo que necesita el matcher) */
export interface ExistingPlayer {
  id: string;
  displayName: string;
  normalizedName: string;
  club: string | null;
  normalizedClub: string | null;
  betaIds: string[]; // externalIds de provider "betadomino"
}

export interface MatchProposal {
  rowIndex: number;
  status: MatchStatus;
  confidence: number;
  proposedPlayerId: string | null;
  proposedDisplayName: string | null;
  reason: string;
  candidates?: Array<{
    playerId: string;
    displayName: string;
    score: number;
  }>;
}

export interface MatchedRow {
  raw: RawPlayerRow;
  match: MatchProposal;
  normalized: {
    displayName: string;
    club: string;
    betaId: string | null;
  };
}

export interface MatchResult {
  rows: MatchedRow[];
  stats: {
    total: number;
    exactId: number;
    exactName: number;
    fuzzyName: number;
    newPlayers: number;
    conflicts: number;
  };
}
