/**
 * Parser para formato Parejas de BetaDomino.
 * Hojas:
 *  - "Ranking Parejas"
 *  - "Jugadores Individual"  ← usamos esta para matching por jugador
 *
 * Priorizamos la hoja "Jugadores Individual" porque el matching
 * se hace a nivel de jugador, no de pareja.
 */

import type { RawPlayerRow } from "../types";
import { normalizeId, parseAvg, parseIntSafe } from "../normalize";

export function isPairsWorkbook(sheetNames: string[]): boolean {
  const upper = sheetNames.map((s) => s.toUpperCase());
  const hasRanking = upper.some(
    (s) => s.includes("RANKING") && (s.includes("PAREJA") || s.includes("EQUIPO"))
  );
  const hasIndividual = upper.some(
    (s) => s.includes("JUGADOR") && s.includes("INDIVIDUAL")
  );
  return hasRanking && hasIndividual;
}

/**
 * Parsea la hoja "Jugadores Individual" del formato Parejas.
 * Columnas: POS | JUGADOR | ID / USUARIO | PAREJA / EQUIPO | CLUB / ESTADO | PJ | PG | PP | EFE | PF | PC | PM | AVG | SANCIONES
 */
export function parsePairsIndividualRows(
  rows: unknown[][],
  headerRowIndex = 0
): { rows: RawPlayerRow[]; warnings: string[] } {
  const warnings: string[] = [];
  if (rows.length < 2) {
    return { rows: [], warnings: ["Hoja Jugadores Individual sin datos"] };
  }

  const headers = (rows[headerRowIndex] as unknown[]).map((h) =>
    String(h || "").toUpperCase().trim()
  );

  const col = (name: string): number =>
    headers.findIndex((h) => h === name || h.includes(name));

  const idxPos = col("POS");
  const idxName = col("JUGADOR");
  const idxId = headers.findIndex(
    (h) => h.includes("ID") && h.includes("USUARIO")
  );
  const idxPair = headers.findIndex(
    (h) => h.includes("PAREJA") || h.includes("EQUIPO")
  );
  const idxClub = headers.findIndex(
    (h) => h.includes("CLUB") || h.includes("ESTADO")
  );
  const idxPj = col("PJ");
  const idxPg = col("PG");
  const idxPp = col("PP");
  const idxEfe = col("EFE");
  const idxPf = col("PF");
  const idxPc = col("PC");
  const idxPm = col("PM");
  const idxAvg = col("AVG");
  const idxSan = headers.findIndex((h) => h.includes("SANCION"));

  if (idxName < 0) {
    warnings.push("No se encontró columna JUGADOR en hoja Individual de Parejas");
    return { rows: [], warnings };
  }

  const result: RawPlayerRow[] = [];

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (!row || row.every((c) => c === null || c === undefined || c === "")) {
      continue;
    }

    const nameRaw = String(row[idxName] ?? "").trim();
    if (!nameRaw) continue;

    const betaId = normalizeId(
      idxId >= 0 ? (row[idxId] as string | number | null) : null
    );

    result.push({
      rowIndex: i,
      pos: parseIntSafe(row[idxPos], result.length + 1),
      nameRaw,
      betaId,
      clubRaw: idxClub >= 0 ? String(row[idxClub] ?? "").trim() : "",
      pj: parseIntSafe(row[idxPj]),
      pg: parseIntSafe(row[idxPg]),
      pp: parseIntSafe(row[idxPp]),
      efe: parseIntSafe(row[idxEfe]),
      pf: parseIntSafe(row[idxPf]),
      pc: parseIntSafe(row[idxPc]),
      pm: parseIntSafe(row[idxPm]),
      avg: parseAvg(row[idxAvg]),
      sanctions:
        idxSan >= 0 && row[idxSan] != null && row[idxSan] !== ""
          ? parseIntSafe(row[idxSan])
          : null,
      pairId:
        idxPair >= 0 && row[idxPair] != null
          ? String(row[idxPair]).trim()
          : undefined,
    });
  }

  return { rows: result, warnings };
}
