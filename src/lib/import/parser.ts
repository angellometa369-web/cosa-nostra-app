/**
 * Punto de entrada del parser BetaDomino.
 * Detecta formato y delega al parser correcto.
 */

import * as XLSX from "xlsx";
import type { DetectedType, ParseResult, RawPlayerRow } from "./types";
import {
  buildExternalKey,
  parseFilenameMeta,
} from "./normalize";
import {
  isIndividualSheet,
  parseIndividualRows,
} from "./parsers/individual";
import {
  isPairsWorkbook,
  parsePairsIndividualRows,
} from "./parsers/pairs";

export interface ParseOptions {
  filename?: string;
}

/**
 * Lee un ArrayBuffer / Buffer / Uint8Array de un .xlsx de BetaDomino
 * y devuelve la estructura normalizada lista para matching.
 */
export function parseBetaDominoFile(
  data: ArrayBuffer | Buffer | Uint8Array,
  options: ParseOptions = {}
): ParseResult {
  const workbook = XLSX.read(data, { type: "array" });
  const sheetNames = workbook.SheetNames;
  const warnings: string[] = [];

  const filename = options.filename || "unknown.xlsx";
  const fileMeta = parseFilenameMeta(filename);

  // --- Detección de formato ---
  let detectedType: DetectedType;
  let rows: RawPlayerRow[] = [];
  let parseWarnings: string[] = [];

  if (isPairsWorkbook(sheetNames)) {
    detectedType = "parejas";
    // Preferimos la hoja de jugadores individuales
    const individualSheetName =
      sheetNames.find((s) =>
        s.toUpperCase().includes("JUGADOR") &&
        s.toUpperCase().includes("INDIVIDUAL")
      ) || sheetNames[1];

    const sheet = workbook.Sheets[individualSheetName];
    const aoa = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      raw: false,
    }) as unknown[][];

    const parsed = parsePairsIndividualRows(aoa);
    rows = parsed.rows;
    parseWarnings = parsed.warnings;
  } else {
    // Intentar Individual
    let found = false;
    for (const name of sheetNames) {
      const sheet = workbook.Sheets[name];
      const aoa = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: null,
        raw: false,
      }) as unknown[][];

      if (aoa.length === 0) continue;
      const headers = (aoa[0] as unknown[]).map((h) =>
        String(h || "")
      );

      if (isIndividualSheet(name, headers)) {
        detectedType = "individual";
        const parsed = parseIndividualRows(aoa);
        rows = parsed.rows;
        parseWarnings = parsed.warnings;
        found = true;
        break;
      }
    }

    if (!found) {
      // Último intento: primera hoja con columnas POS + JUGADOR
      const first = sheetNames[0];
      const sheet = workbook.Sheets[first];
      const aoa = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: null,
        raw: false,
      }) as unknown[][];
      const parsed = parseIndividualRows(aoa);
      if (parsed.rows.length > 0) {
        detectedType = "individual";
        rows = parsed.rows;
        parseWarnings = parsed.warnings;
        warnings.push(
          `Formato no detectado con certeza; se interpretó como Individual desde hoja "${first}"`
        );
      } else {
        throw new Error(
          `No se pudo detectar formato BetaDomino. Hojas: ${sheetNames.join(", ")}`
        );
      }
    }
  }

  warnings.push(...parseWarnings);

  const tournamentName =
    fileMeta.name ||
    (detectedType === "parejas" ? "Torneo Parejas" : "Torneo Individual");

  return {
    detectedType: detectedType!,
    tournament: {
      name: tournamentName,
      date: fileMeta.date,
      roundNumber: fileMeta.roundNumber,
      sourceFilename: filename,
    },
    rows,
    warnings,
  };
}

/** Helper para construir externalKey a partir del resultado del parser */
export function getExternalKeyFromParse(result: ParseResult): string {
  return buildExternalKey({
    type: result.detectedType,
    name: result.tournament.name,
    date: result.tournament.date,
    roundNumber: result.tournament.roundNumber,
  });
}
