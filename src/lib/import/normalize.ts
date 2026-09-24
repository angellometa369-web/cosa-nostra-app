/**
 * Normalización de nombres, IDs y clubs para matching determinista.
 */

/** Quita acentos, pasa a mayúsculas, limpia caracteres y espacios */
export function normalizeName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normaliza ID de BetaDomino: "003" → "3", "06" → "6", "0" → "0" */
export function normalizeId(id: string | number | null | undefined): string | null {
  if (id === null || id === undefined || id === "") return null;
  const s = String(id).trim();
  if (!s) return null;
  // Quitar ceros a la izquierda, pero conservar "0"
  const cleaned = s.replace(/^0+/, "") || "0";
  return cleaned;
}

/**
 * Normalización de club, consultando mapa de alias (desde DB o fallback hardcodeado).
 */
export function normalizeClub(
  club: string | null | undefined,
  aliasMap?: Map<string, string> | Record<string, string>
): string {
  if (!club) return "";
  let n = normalizeName(club);

  if (aliasMap) {
    const canonical =
      aliasMap instanceof Map ? aliasMap.get(n) : aliasMap[n];
    if (canonical) return canonical;
  }

  // Fallback de arranque
  const aliases: Record<string, string> = {
    "S MENDOZA": "S MENDOZA",
    "S.MENDOZA": "S MENDOZA",
    SMENDOZA: "S MENDOZA",
    "SANTA MENDOZA": "S MENDOZA",
    "EL DIVIDIVE": "DIVIDIVE",
    DIVIDIVE: "DIVIDIVE",
    VALERA: "VALERA",
    BETIJOQUE: "BETIJOQUE",
    TRUJILLO: "TRUJILLO",
    "KM 23": "KM 23",
    KM23: "KM 23",
  };

  return aliases[n] ?? n;
}

/** Convierte "86%" o 0.86 o 86 a número 0–1 */
export function parseAvg(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") {
    return value > 1 ? value / 100 : value;
  }
  const s = String(value).replace("%", "").trim().replace(",", ".");
  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  return n > 1 ? n / 100 : n;
}

export function parseIntSafe(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = typeof value === "number" ? value : parseInt(String(value), 10);
  return isNaN(n) ? fallback : n;
}

/**
 * Genera externalKey lógico del torneo.
 * Formato: betadomino|{type}|{normalizedName}|{date}|{round}
 */
export function buildExternalKey(params: {
  type: "individual" | "parejas";
  name: string;
  date: string | null;
  roundNumber: number | null;
}): string {
  const namePart = normalizeName(params.name).replace(/\s+/g, "_") || "UNKNOWN";
  const datePart = params.date || "unknown-date";
  const roundPart =
    params.roundNumber !== null && params.roundNumber !== undefined
      ? String(params.roundNumber)
      : "unknown-round";
  return `betadomino|${params.type}|${namePart}|${datePart}|${roundPart}`;
}

/**
 * Intenta extraer nombre, ronda y fecha del nombre de archivo típico de BetaDomino.
 * Ejemplo: Resultado_Total_TORNEO_COPA_NATALE_BONGIOVANNI_Ronda_7_2026-09-22.xlsx
 */
export function parseFilenameMeta(filename: string): {
  name: string | null;
  roundNumber: number | null;
  date: string | null;
} {
  const base = filename.replace(/\.xlsx$/i, "").replace(/\.xls$/i, "");

  // Fecha YYYY-MM-DD al final
  const dateMatch = base.match(/(\d{4}-\d{2}-\d{2})$/);
  const date = dateMatch ? dateMatch[1] : null;

  // Ronda_N
  const roundMatch = base.match(/Ronda[_\s-]?(\d+)/i);
  const roundNumber = roundMatch ? parseInt(roundMatch[1], 10) : null;

  // Nombre del torneo: entre Resultado_Total_ y _Ronda
  let name: string | null = null;
  const nameMatch = base.match(
    /Resultado[_\s-]?Total[_\s-]+(.+?)[_\s-]+Ronda/i
  );
  if (nameMatch) {
    name = nameMatch[1]
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } else {
    // Fallback: todo menos prefijo y sufijos
    name = base
      .replace(/^Resultado[_\s-]?Total[_\s-]*/i, "")
      .replace(/[_\s-]*Ronda[_\s-]?\d+.*/i, "")
      .replace(/_/g, " ")
      .trim() || null;
  }

  return { name, roundNumber, date };
}
