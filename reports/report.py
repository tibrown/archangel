#!/usr/bin/env python3
"""Archangel DB reports.

Queries the local DSIS Archangel MariaDB (via bridge/db.py, which auto-reads
bridge/.env for credentials — no secrets hardcoded) and prints clean Markdown I
can relay straight back into chat.

Usage:
    python3 reports/report.py <report-name> [args...]

Add a report by writing a function and registering it in REPORTS below.
"""
import sys
from pathlib import Path

# Allow `import db` from bridge/ (it lives one directory up).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "bridge"))

import db  # noqa: E402


def decode_structures(structures, levels):
    """Turn the parallel '*' separated name/level strings into (name, level) pairs.

    e.g. "Urban Structures*Solar Plants" + "2*2" -> [("Urban Structures","2"), ...]
    """
    names = (structures or "").split("*")
    lvls = (levels or "").split("*")
    out = []
    for i, name in enumerate(names):
        name = name.strip()
        if not name:
            continue
        lvl = lvls[i].strip() if i < len(lvls) and lvls[i].strip() else "?"
        out.append((name, lvl))
    return out


def fmt_structures(structures, levels):
    pairs = decode_structures(structures, levels)
    if not pairs:
        return "—"
    return ", ".join(f"{n} {lv}" for n, lv in pairs)


def report_bases():
    """All bases, complete with their structure names and levels."""
    rows = db.query(
        """
        SELECT coords, base_name, owner_name, terrain,
               current_econ, production, construction, research,
               structures, structure_levels
          FROM bases
         ORDER BY coords
        """
    )
    if not rows:
        print("No bases captured yet.")
        return

    print(f"**Bases: {len(rows)}**\n")
    print("| Coords | Base | Owner | Terrain | Econ | Prod | Constr | Research | Structures |")
    print("|---|---|---|---|---|---|---|---|---|")
    for r in rows:
        coords = r["coords"] or "?"
        name = r["base_name"] or "—"
        owner = r["owner_name"] or "—"
        terrain = r["terrain"] or "—"
        econ = r["current_econ"] or "—"
        prod = r["production"] or "—"
        con = r["construction"] or "—"
        res = r["research"] or "—"
        structures = fmt_structures(r["structures"], r["structure_levels"])
        print(f"| {coords} | {name} | {owner} | {terrain} | {econ} | {prod} | {con} | {res} | {structures} |")


REPORTS = {
    "bases": report_bases,
}


def main(argv):
    if not argv:
        print("usage: report.py <" + "|".join(sorted(REPORTS)) + ">")
        return 1
    name = argv[0]
    fn = REPORTS.get(name)
    if not fn:
        print(f"Unknown report '{name}'. Available: {', '.join(sorted(REPORTS))}")
        return 1
    fn()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))