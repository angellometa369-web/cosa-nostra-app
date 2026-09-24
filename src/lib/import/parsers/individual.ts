/**
 * Parser para formato Individual de BetaDomino.
 * Hoja: "Resultado Total"
 * Columnas: POS | JUGADOR | ID / USUARIO | CLUB / ESTADO | PJ | PG | PP | EFE | PF | PC | PM | AVG | SANCIONES
 */

import type { RawPlayerRow } from "../types";
import { normalizeId, parseAvg, parseIntSafe } from "../normalize";

const REQUIRED_HEADERS = [
  "POS",
  "JUGADOR",
  "ID / USUARIO",
  "CLUB / ESTADO",
  "PJ",
  "PG",
  "PP",
  "EFE",
  "PF",
  "PC",
  "PM",
  "AVG",
];

export function isIndividualSheet(
  sheetName: string,
  headers: string[]
): boolean {
  const upper = headers.map((h) => String(h || "").toUpperCase().trim());
  const hasJugador = upper.includes("JUGADOR");
  const hasId = upper.some((h) => h.includes("ID") && h.includes("USUARIO"));
  const noPareja = !upper.some((h) => h.includes("PAREJA") || h.includes("EQUIPO"));
  return (
    (sheetName.toUpperCase().includes("RESULTADO") ||
      sheetName.toUpperCase().includes("TOTAL")) &&
    hasJugador &&
    hasId &&
    noPareja
  );
}

export function parseIndividualRows(
  rows: unknown[][],
  headerRowIndex = 0
): { rows: RawPlayerRow[]; warnings: string[] } {
  const warnings: string[] = [];
  if (rows.length < 2) {
    return { rows: [], warnings: ["Hoja Individual sin datos"] };
  }

  const headers = (rows[headerRowIndex] as unknown[]).map((h) =>
    String(h || "").toUpperCase().trim()
  );

  const col = (name: string): number => {
    const idx = headers.findIndex(
      (h) => h === name || h.includes(name)
    );
    return idx;
  };

  const idxPos = col("POS");
  const idxName = col("JUGADOR");
  const idxId = headers.findIndex((h) => h.includes("ID") && h.includes("USUARIO"));
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
    warnings.push("No se encontró columna JUGADOR");
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

    const betaIdRaw = idxId >= 0 ? row[idxId] : null;
    const betaId = normalizeId(betaIdRaw as string | number | null);

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
    });
  }

  return { rows: result, warnings };
}
