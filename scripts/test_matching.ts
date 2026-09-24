import { normalizeName, normalizeClub, normalizeId, parseAvg, buildExternalKey } from "../src/lib/import/normalize";
import { matchPlayers } from "../src/lib/import/matcher";
import type { ExistingPlayer, RawPlayerRow } from "../src/lib/import/types";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILURE: ${msg}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${msg}`);
  }
}

console.log("=== RUNNING SUITE: Normalization & Matching Tests ===");

// 1. Test Normalization Functions
assert(normalizeName("Vito Corleone!!") === "VITO CORLEONE", "normalizeName removes punctuation & uppercase");
assert(normalizeName("  josé   maría  ") === "JOSE MARIA", "normalizeName removes accents & extra spaces");
assert(normalizeId("007") === "7", "normalizeId strips leading zeroes");
assert(normalizeId("0") === "0", "normalizeId preserves single zero");
assert(parseAvg("85.5%") === 0.855, "parseAvg parses string percentage");

// 2. Test Club Normalization with Alias Map
const aliasMap = new Map<string, string>();
aliasMap.set("S MENDOZA", "SANTA MENDOZA");
aliasMap.set("S.MENDOZA", "SANTA MENDOZA");

assert(normalizeClub("S.MENDOZA", aliasMap) === "SANTA MENDOZA", "normalizeClub maps alias correctly");
assert(normalizeClub("VALERA", aliasMap) === "VALERA", "normalizeClub preserves unmapped canonical");

// 3. Test External Key Builder
const key = buildExternalKey({
  type: "individual",
  name: "Copa Natale Bongiovanni",
  date: "2026-09-22",
  roundNumber: 7,
});
assert(key === "betadomino|individual|COPA_NATALE_BONGIOVANNI|2026-09-22|7", "buildExternalKey generates correct format");

// 4. Test Player Matcher
const existingPlayers: ExistingPlayer[] = [
  {
    id: "p1",
    displayName: "DON VITO CORLEONE",
    normalizedName: "DON VITO CORLEONE",
    club: "VALERA",
    normalizedClub: "VALERA",
    betaIds: ["10"],
  },
  {
    id: "p2",
    displayName: "SONNY CORLEONE",
    normalizedName: "SONNY CORLEONE",
    club: "VALERA",
    normalizedClub: "VALERA",
    betaIds: ["20"],
  },
];

const testRows: RawPlayerRow[] = [
  {
    rowIndex: 0,
    pos: 1,
    nameRaw: "DON VITO CORLEONE",
    betaId: "010",
    clubRaw: "VALERA",
    pj: 5, pg: 5, pp: 0, efe: 100, pf: 500, pc: 400, pm: 0, avg: 1,
  },
  {
    rowIndex: 1,
    pos: 2,
    nameRaw: "SONNY CORLEONE",
    betaId: null,
    clubRaw: "VALERA",
    pj: 5, pg: 4, pp: 1, efe: 80, pf: 480, pc: 400, pm: 0, avg: 0.8,
  },
  {
    rowIndex: 2,
    pos: 3,
    nameRaw: "FREDDO CORLEONE",
    betaId: null,
    clubRaw: "VALERA",
    pj: 5, pg: 2, pp: 3, efe: -10, pf: 390, pc: 400, pm: 0, avg: 0.4,
  },
];

const matchResult = matchPlayers(testRows, existingPlayers);

assert(matchResult.stats.total === 3, "Matcher processed 3 rows");
assert(matchResult.stats.exactId === 1, "Row 0 matched by exact betaId (010 -> 10)");
assert(matchResult.stats.exactName === 1, "Row 1 matched by exact name + club");
assert(matchResult.stats.newPlayers === 1, "Row 2 flagged as new player");

console.log("\n✨ ALL TESTS PASSED SUCCESSFULLY! ✨");
