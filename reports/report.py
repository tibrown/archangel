#!/usr/bin/env python3
"""Archangel DB reports.

Queries the local DSIS Archangel MariaDB (via bridge/db.py, which auto-reads
bridge/.env for credentials — no secrets hardcoded) and prints clean Markdown I
can relay straight back into chat.

Usage:
    python3 reports/report.py <report-name> [args...]

Add a report by writing a function and registering it in REPORTS below.
"""
import json
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
    """All bases grouped by server (helion, gamma, ...), with structures."""
    rows = db.query(
        """
        SELECT s.server_name AS server, b.coords, b.base_name, b.owner_name, b.terrain,
               b.current_econ, b.production, b.construction, b.research,
               b.structures, b.structure_levels
          FROM bases b
          LEFT JOIN servers s ON s.servid = b.servid
         ORDER BY s.server_name, b.coords
        """
    )
    if not rows:
        print("No bases captured yet.")
        return

    print(f"**Bases: {len(rows)}**\n")
    print("| Server | Coords | Base | Owner | Terrain | Econ | Prod | Constr | Research | Structures |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    for r in rows:
        server = r["server"] or "?"
        coords = r["coords"] or "?"
        name = r["base_name"] or "—"
        owner = r["owner_name"] or "—"
        terrain = r["terrain"] or "—"
        econ = r["current_econ"] or "—"
        prod = r["production"] or "—"
        con = r["construction"] or "—"
        res = r["research"] or "—"
        structures = fmt_structures(r["structures"], r["structure_levels"])
        print(f"| {server} | {coords} | {name} | {owner} | {terrain} | {econ} | {prod} | {con} | {res} | {structures} |")


def _json(s):
    """Parse a JSON column (pymysql returns it as a string) into a dict/list.

    Returns None when the value is empty/None or not valid JSON.
    """
    if not s:
        return None
    try:
        return json.loads(s)
    except (ValueError, TypeError):
        return None


def _scalar_summary(obj, max_pairs=8):
    """Flatten the scalar (non-container) top-level fields of a JSON object.

    Nested dicts/lists are summarised as their element count so we never dump
    raw serialized JSON into the table. e.g. {"a": 1, "b": {"x": 2}} ->
    "a=1, b={…}".
    """
    if isinstance(obj, dict):
        parts = []
        for k, v in obj.items():
            if isinstance(v, (dict, list)):
                parts.append(f"{k}={len(v)}×")
            else:
                parts.append(f"{k}={v}")
            if len(parts) >= max_pairs:
                parts.append("…")
                break
        return ", ".join(parts)
    if isinstance(obj, list):
        return f"[{len(obj)} items]"
    return str(obj)


def _fmt(v):
    """Render a DB value safely for a Markdown cell."""
    if v is None:
        return "—"
    s = str(v)
    return s if s.strip() else "—"


def report_servers():
    """Registered servers and their galaxy data summary."""
    rows = db.query("SELECT servid, server_name, galaxy_data FROM servers ORDER BY servid")
    if not rows:
        print("No servers captured yet.")
        return
    print(f"**Servers: {len(rows)}**\n")
    print("| ServID | Server | Galaxy data |")
    print("|---|---|---|")
    for r in rows:
        gd = _scalar_summary(_json(r["galaxy_data"]))
        print(f"| {r['servid']} | {_fmt(r['server_name'])} | {_fmt(gd)} |")


def report_astros():
    """All scanned astros (planets/moons/asteroids) with owner + terrain."""
    rows = db.query(
        """
        SELECT s.server_name AS server, a.coord, a.owner_name, a.owner_guild_tag,
               a.terrain, a.debris, a.wormhole, a.has_eyes
          FROM astros a
          LEFT JOIN servers s ON s.servid = a.servid
         ORDER BY s.server_name, a.coord
        """
    )
    if not rows:
        print("No astros captured yet.")
        return
    print(f"**Astros: {len(rows)}**\n")
    print("| Server | Coord | Owner | Guild | Terrain | Debris | Wormhole | Eyes |")
    print("|---|---|---|---|---|---|---|---|")
    for r in rows:
        owner = r["owner_name"] or "—"
        guild = r["owner_guild_tag"] or "—"
        debris = r["debris"] if r["debris"] else "—"
        wormhole = r["wormhole"] if r["wormhole"] not in (None, "0", 0) else "—"
        eyes = "yes" if r["has_eyes"] else "no"
        print(f"| {_fmt(r['server'])} | {r['coord']} | {owner} | {guild} | {_fmt(r['terrain'])} | {debris} | {wormhole} | {eyes} |")


def report_systems():
    """All scanned systems with their eye status."""
    rows = db.query(
        """
        SELECT s.server_name AS server, sy.system, sy.has_eyes, sy.scanned_at
          FROM systems sy
          LEFT JOIN servers s ON s.servid = sy.servid
         ORDER BY s.server_name, sy.system
        """
    )
    if not rows:
        print("No systems captured yet.")
        return
    print(f"**Systems: {len(rows)}**\n")
    print("| Server | System | Eyes | Scanned |")
    print("|---|---|---|---|")
    for r in rows:
        eyes = "yes" if r["has_eyes"] else "no"
        print(f"| {_fmt(r['server'])} | {r['system']} | {eyes} | {_fmt(r['scanned_at'])} |")


def report_system_astros():
    """Every astro in each scanned system (from system-level scans)."""
    rows = db.query(
        """
        SELECT s.server_name AS server, sa.system, sa.coord, sa.empty, sa.terrain,
               sa.base_id, sa.player_id, sa.wormhole, sa.occ_player_id, sa.debris
          FROM system_astros sa
          LEFT JOIN servers s ON s.servid = sa.servid
         ORDER BY s.server_name, sa.system, sa.coord
        """
    )
    if not rows:
        print("No system astros captured yet.")
        return
    print(f"**System astros: {len(rows)}**\n")
    print("| Server | System | Coord | Empty | Terrain | Base | Player | Wormhole | Occ | Debris |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    for r in rows:
        empty = "yes" if r["empty"] else "no"
        base = r["base_id"] if r["base_id"] else "—"
        player = r["player_id"] if r["player_id"] else "—"
        wh = "yes" if r["wormhole"] else "—"
        occ = r["occ_player_id"] if r["occ_player_id"] else "—"
        debris = r["debris"] if r["debris"] else "—"
        print(f"| {_fmt(r['server'])} | {r['system']} | {r['coord']} | {empty} | {_fmt(r['terrain'])} | {base} | {player} | {wh} | {occ} | {debris} |")


def report_fleets():
    """Current fleet positions (one row per fleet, refreshed on each sighting)."""
    rows = db.query(
        """
        SELECT s.server_name AS server, f.fleet_id, f.fleetname, f.player_id,
               f.guild_tag, f.location, f.destination, f.arrival, f.size, f.has_eyes
          FROM fleets f
          LEFT JOIN servers s ON s.servid = f.servid
         ORDER BY s.server_name, f.location, f.fleet_id
        """
    )
    if not rows:
        print("No fleets captured yet.")
        return
    print(f"**Fleets: {len(rows)}**\n")
    print("| Server | Fleet ID | Name | Player | Guild | Location | Destination | Arrival | Size | Eyes |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    for r in rows:
        eyes = "yes" if r["has_eyes"] else "no"
        print(
            f"| {_fmt(r['server'])} | {r['fleet_id']} | {_fmt(r['fleetname'])} | {_fmt(r['player_id'])} | "
            f"{_fmt(r['guild_tag'])} | {_fmt(r['location'])} | {_fmt(r['destination'])} | "
            f"{_fmt(r['arrival'])} | {_fmt(r['size'])} | {eyes} |"
        )


def report_fleet_details():
    """Detailed fleet compositions (scalar fields of the details JSON)."""
    rows = db.query(
        """
        SELECT s.server_name AS server, fd.fleet_id, fd.details, fd.scanned_at
          FROM fleet_details fd
          LEFT JOIN servers s ON s.servid = fd.servid
         ORDER BY s.server_name, fd.fleet_id
        """
    )
    if not rows:
        print("No fleet details captured yet.")
        return
    print(f"**Fleet details: {len(rows)}**\n")
    print("| Server | Fleet ID | Details | Scanned |")
    print("|---|---|---|---|")
    for r in rows:
        print(f"| {_fmt(r['server'])} | {r['fleet_id']} | {_fmt(_scalar_summary(_json(r['details'])))} | {_fmt(r['scanned_at'])} |")


def report_combat():
    """Combat reports (deduped on servid/location/battle_time/att/def)."""
    rows = db.query(
        """
        SELECT s.server_name AS server, c.location, c.att_id, c.att_level,
               c.def_id, c.def_level, c.battle_time,
               c.att_fleet_loss, c.def_fleet_loss, c.att_xp, c.def_xp, c.debris,
               c.pillage, c.conquered, c.commanders_killed, c.att_units, c.def_units
          FROM combat_reports c
          LEFT JOIN servers s ON s.servid = c.servid
         ORDER BY s.server_name, c.location, c.battle_time
        """
    )
    if not rows:
        print("No combat reports captured yet.")
        return
    print(f"**Combat reports: {len(rows)}**\n")
    print("| Server | Location | Attacker | Defender | Time | Att loss | Def loss | Att XP | Def XP | Debris | Pillage | Conq |")
    print("|---|---|---|---|---|---|---|---|---|---|---|---|")
    for r in rows:
        att = f"{r['att_id'] or '?'} (lvl {r['att_level'] or '?'})"
        deff = f"{r['def_id'] or '?'} (lvl {r['def_level'] or '?'})"
        conq = "yes" if r["conquered"] else "—"
        print(
            f"| {_fmt(r['server'])} | {r['location']} | {att} | {deff} | {_fmt(r['battle_time'])} | "
            f"{_fmt(r['att_fleet_loss'])} | {_fmt(r['def_fleet_loss'])} | "
            f"{_fmt(r['att_xp'])} | {_fmt(r['def_xp'])} | {_fmt(r['debris'])} | "
            f"{_fmt(r['pillage'])} | {conq} |"
        )


def report_profiles():
    """Known player profiles."""
    rows = db.query(
        """
        SELECT s.server_name AS server, p.player_id, p.player_name, p.guild_tag,
               p.guild_name, p.level, p.inactive_days, p.days_in_vac
          FROM profiles p
          LEFT JOIN servers s ON s.servid = p.servid
         ORDER BY s.server_name, p.player_name
        """
    )
    if not rows:
        print("No profiles captured yet.")
        return
    print(f"**Profiles: {len(rows)}**\n")
    print("| Server | Player ID | Name | Guild | Guild Name | Level | Inactive | In-vac |")
    print("|---|---|---|---|---|---|---|---|")
    for r in rows:
        print(
            f"| {_fmt(r['server'])} | {r['player_id']} | {_fmt(r['player_name'])} | {_fmt(r['guild_tag'])} | "
            f"{_fmt(r['guild_name'])} | {_fmt(r['level'])} | {_fmt(r['inactive_days'])} | "
            f"{_fmt(r['days_in_vac'])} |"
        )


def report_guilds():
    """Known guilds."""
    rows = db.query(
        """
        SELECT s.server_name AS server, g.guild_id, g.guild_name, g.guild_tag
          FROM guilds g
          LEFT JOIN servers s ON s.servid = g.servid
         ORDER BY s.server_name, g.guild_tag
        """
    )
    if not rows:
        print("No guilds captured yet.")
        return
    print(f"**Guilds: {len(rows)}**\n")
    print("| Server | Guild ID | Tag | Name |")
    print("|---|---|---|---|")
    for r in rows:
        print(f"| {_fmt(r['server'])} | {r['guild_id']} | {_fmt(r['guild_tag'])} | {_fmt(r['guild_name'])} |")


def report_guild_members():
    """Guild membership rosters (player per guild)."""
    rows = db.query(
        """
        SELECT s.server_name AS server, g.guild_tag, gm.nick, gm.level, gm.player_id, gm.scanned_at
          FROM guild_members gm
          LEFT JOIN guilds g ON g.servid = gm.servid AND g.guild_id = gm.guild_id
          LEFT JOIN servers s ON s.servid = gm.servid
         ORDER BY s.server_name, g.guild_tag, gm.level DESC
        """
    )
    if not rows:
        print("No guild members captured yet.")
        return
    print(f"**Guild members: {len(rows)}**\n")
    print("| Server | Guild | Player ID | Nick | Level | Scanned |")
    print("|---|---|---|---|---|---|")
    for r in rows:
        print(
            f"| {_fmt(r['server'])} | {_fmt(r['guild_tag'])} | {r['player_id']} | {_fmt(r['nick'])} | "
            f"{_fmt(r['level'])} | {_fmt(r['scanned_at'])} |"
        )


def report_technologies():
    """Technology levels per captured player."""
    rows = db.query(
        """
        SELECT s.server_name AS server, t.user_id, t.tech, t.level, t.scanned_at
          FROM technologies t
          LEFT JOIN servers s ON s.servid = t.servid
         ORDER BY s.server_name, t.user_id, t.tech
        """
    )
    if not rows:
        print("No technologies captured yet.")
        return
    print(f"**Technologies: {len(rows)}**\n")
    print("| Server | User ID | Tech | Level | Scanned |")
    print("|---|---|---|---|---|")
    for r in rows:
        print(f"| {_fmt(r['server'])} | {r['user_id']} | {r['tech']} | {_fmt(r['level'])} | {_fmt(r['scanned_at'])} |")


def report_capacities():
    """Economy/construction/production/research capacities per player."""
    rows = db.query(
        """
        SELECT s.server_name AS server, c.user_id, c.economy, c.construction,
               c.production, c.research, c.scanned_at
          FROM capacities c
          LEFT JOIN servers s ON s.servid = c.servid
         ORDER BY s.server_name, c.user_id
        """
    )
    if not rows:
        print("No capacities captured yet.")
        return
    print(f"**Capacities: {len(rows)}**\n")
    print("| Server | User ID | Economy | Construction | Production | Research | Scanned |")
    print("|---|---|---|---|---|---|---|")
    for r in rows:
        print(
            f"| {_fmt(r['server'])} | {r['user_id']} | {_fmt(r['economy'])} | {_fmt(r['construction'])} | "
            f"{_fmt(r['production'])} | {_fmt(r['research'])} | {_fmt(r['scanned_at'])} |"
        )


def report_storage_packets():
    """Storage packets (preferences, bookmarks/spy, activescout) — scalar fields only."""
    rows = db.query(
        """
        SELECT s.server_name AS server, sp.storage_key, sp.storage_type,
               sp.storage_data, sp.updated_at
          FROM storage_packets sp
          LEFT JOIN servers s ON s.servid = sp.servid
         ORDER BY s.server_name, sp.storage_key
        """
    )
    if not rows:
        print("No storage packets captured yet.")
        return
    type_names = {0: "preferences", 1: "bookmarks/spy", 2: "activescout"}
    print(f"**Storage packets: {len(rows)}**\n")
    print("| Server | Key | Type | Data | Updated |")
    print("|---|---|---|---|---|")
    for r in rows:
        t = type_names.get(r["storage_type"], str(r["storage_type"]))
        print(
            f"| {_fmt(r['server'])} | {r['storage_key']} | {t} | {_fmt(_scalar_summary(_json(r['storage_data'])))} | "
            f"{_fmt(r['updated_at'])} |"
        )


def report_capture_events():
    """Lossless raw-JSON capture log — summarised per server+mode (never dump rows)."""
    rows = db.query(
        """
        SELECT s.server_name AS server, ce.mode, COUNT(*) c,
               MIN(ce.received_at) first_seen, MAX(ce.received_at) last_seen
          FROM capture_events ce
          LEFT JOIN servers s ON s.servid = ce.servid
         GROUP BY s.server_name, ce.mode
         ORDER BY s.server_name, c DESC
        """
    )
    if not rows:
        print("No capture events recorded yet.")
        return
    total = db.query_one("SELECT COUNT(*) c FROM capture_events")["c"]
    print(f"**Capture events: {total} total**\n")
    print("| Server | Mode | Count | First seen | Last seen |")
    print("|---|---|---|---|---|")
    for r in rows:
        print(f"| {_fmt(r['server'])} | {r['mode']} | {r['c']} | {_fmt(r['first_seen'])} | {_fmt(r['last_seen'])} |")


def report_error_log():
    """Captured errors — scalar fields from the error_report JSON."""
    rows = db.query(
        """
        SELECT e.id, s.server_name AS server, e.user_id, e.base_url, e.error_report, e.created_at
          FROM error_log e
          LEFT JOIN servers s ON s.servid = e.servid
         ORDER BY e.created_at DESC
        """
    )
    if not rows:
        print("No errors captured yet.")
        return
    print(f"**Error log: {len(rows)}**\n")
    print("| ID | Server | User | URL | Message | Created |")
    print("|---|---|---|---|---|---|")
    for r in rows:
        rep = _json(r["error_report"]) or {}
        msg = rep.get("Message") or rep.get("Exception") or "—"
        print(
            f"| {r['id']} | {_fmt(r['server'])} | {_fmt(r['user_id'])} | {_fmt(r['base_url'])} | "
            f"{_fmt(msg)} | {_fmt(r['created_at'])} |"
        )


REPORTS = {
    "bases": report_bases,
    "servers": report_servers,
    "astros": report_astros,
    "systems": report_systems,
    "system_astros": report_system_astros,
    "fleets": report_fleets,
    "fleet_details": report_fleet_details,
    "combat": report_combat,
    "profiles": report_profiles,
    "guilds": report_guilds,
    "guild_members": report_guild_members,
    "technologies": report_technologies,
    "capacities": report_capacities,
    "storage_packets": report_storage_packets,
    "capture_events": report_capture_events,
    "error_log": report_error_log,
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