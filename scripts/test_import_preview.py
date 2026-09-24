#!/usr/bin/env python3
"""
Test de integración: parse → match → buildImportPreview
Simula lo que hace POST /api/import/betadomino/preview
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Reutilizamos el parser/matcher del test anterior
sys.path.insert(0, str(Path(__file__).parent))
from test_import_parser import (  # type: ignore
    FILES,
    ExistingPlayer,
    match_players,
    normalize_club,
    normalize_name,
    parse_file,
)


def build_preview(parse_result, match_result, file_hash: str):
    recognized = match_result[1]["exact_id"] + match_result[1]["exact_name"]
    conflicts = match_result[1]["conflict"]
    fuzzy = match_result[1]["fuzzy_name"]
    new_players = match_result[1]["new"]

    batch = {
        "source": "betadomino",
        "originalFilename": parse_result["file"],
        "fileHash": file_hash,
        "externalKey": parse_result["externalKey"],
        "detectedType": parse_result["detectedType"],
        "tournamentName": parse_result["tournament"]["name"],
        "tournamentDate": parse_result["tournament"]["date"],
        "roundNumber": parse_result["tournament"]["roundNumber"],
        "status": "preview",
        "stats": {
            "totalPlayers": match_result[1]["total"],
            "recognizedPlayers": recognized,
            "newPlayers": new_players,
            "conflicts": conflicts,
            "fuzzyPlayers": fuzzy,
            "rowsProcessed": match_result[1]["total"],
        },
    }

    decisions = []
    rows_ui = []
    for m in match_result[0]:
        status = m["status"]
        action = None
        selected = None
        if status in ("exact_id", "exact_name"):
            action = "accept_match"
            selected = m["proposed"]
        elif status == "new":
            action = "create_new"

        needs_review = status in ("fuzzy_name", "conflict")

        decisions.append({
            "rowIndex": m["pos"],
            "matchStatus": status,
            "proposedDisplayName": m["proposed"],
            "confidence": m["confidence"],
            "action": action,
            "selectedPlayerId": selected,
            "reason": m["reason"],
            "rawName": m["name"],
            "rawBetaId": m["betaId"],
            "rawClub": m["club"],
        })

        rows_ui.append({
            "pos": m["pos"],
            "nameRaw": m["name"],
            "betaId": m["betaId"],
            "clubRaw": m["club"],
            "matchStatus": status,
            "confidence": m["confidence"],
            "proposedDisplayName": m["proposed"],
            "needsReview": needs_review,
            "action": action,
            "reason": m["reason"],
        })

    return {
        "batchId": f"preview_{file_hash[:16]}",
        "status": "preview",
        "tournament": {
            "name": batch["tournamentName"],
            "date": batch["tournamentDate"],
            "roundNumber": batch["roundNumber"],
            "type": batch["detectedType"],
            "externalKey": batch["externalKey"],
        },
        "stats": {
            "players": batch["stats"]["totalPlayers"],
            "recognized": batch["stats"]["recognizedPlayers"],
            "new": batch["stats"]["newPlayers"],
            "conflicts": batch["stats"]["conflicts"],
            "fuzzy": batch["stats"]["fuzzyPlayers"],
        },
        "file": {
            "originalFilename": batch["originalFilename"],
            "fileHash": batch["fileHash"],
        },
        "rows": rows_ui,
        "decisions": decisions,
    }


def main():
    print("=" * 70)
    print("TEST INTEGRACIÓN PREVIEW — parse → match → buildImportPreview")
    print("=" * 70)

    sample = [
        ExistingPlayer("p1", "LUIS SERRADA", normalize_name("LUIS SERRADA"), "VALERA", normalize_club("VALERA"), ["6"]),
        ExistingPlayer("p2", "JULCOR PAREDES", normalize_name("JULCOR PAREDES"), "VALERA", normalize_club("VALERA"), ["3", "4"]),
        ExistingPlayer("p3", "Mariela de Calomino", normalize_name("Mariela de Calomino"), "S.Mendoza", normalize_club("S.Mendoza"), ["23"]),
        ExistingPlayer("p4", "DOUGLAS PERDOMO", normalize_name("DOUGLAS PERDOMO"), "DIVIDIVE", normalize_club("DIVIDIVE"), ["1", "27"]),
    ]

    for path in FILES:
        if not path.exists():
            print(f"[SKIP] {path}")
            continue

        print(f"\n{'─' * 70}")
        print(f"FILE: {path.name}")
        print(f"{'─' * 70}")

        parsed = parse_file(path)
        matched = match_players(parsed["rows"], sample)
        preview = build_preview(parsed, matched, parsed["fileHash"])

        print(f"  batchId     : {preview['batchId']}")
        print(f"  tournament  : {preview['tournament']['name']}")
        print(f"  type        : {preview['tournament']['type']}")
        print(f"  externalKey : {preview['tournament']['externalKey']}")
        print(f"  stats       : {json.dumps(preview['stats'])}")

        needs = [r for r in preview["rows"] if r["needsReview"]]
        auto = [r for r in preview["rows"] if not r["needsReview"]]
        print(f"  auto-action : {len(auto)}  |  needs review: {len(needs)}")

        if needs:
            print("\n  Filas que requieren decisión del admin:")
            for r in needs:
                print(f"    [{r['matchStatus']:11}] POS {r['pos']:>2}  {r['nameRaw']:<25}  → {r['reason']}")

        # Validar que exact_* y new tienen action pre-asignada
        for d in preview["decisions"]:
            if d["matchStatus"] in ("exact_id", "exact_name"):
                assert d["action"] == "accept_match", d
            if d["matchStatus"] == "new":
                assert d["action"] == "create_new", d
            if d["matchStatus"] in ("fuzzy_name", "conflict"):
                assert d["action"] is None, d

        print("  ✓ Decisiones auto-asignadas correctamente")

    print(f"\n{'=' * 70}")
    print("PREVIEW PIPELINE OK")
    print("=" * 70)


if __name__ == "__main__":
    main()
