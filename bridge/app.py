"""DSIS Archangel local bridge.

Mirrors the exact endpoints the (now-dead) DSIS server exposed, so the
extension's parsers and data model stay untouched. Persists to MariaDB.

Wire format (all POST bodies are `application/x-www-form-urlencoded`):
  - storage/angellog: single field `data=<urlencoded JSON>` (PlayerId injected)
  - dataupload: fields `data=<JSON array string>` and `server=<serverName>`
  - parse/script: single field `data=<urlencoded JSON>` of `{request:{mode,...}}`
"""
import json
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import db

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("archangel-bridge")

app = FastAPI(title="DSIS Archangel local bridge")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Helion is the only server we care about for now. servid is arbitrary but
# stable; the extension only needs a consistent integer key.
SERVERS = [
    {"server": "helion", "servid": 1, "galaxyData": None},
]
SERVER_BY_NAME = {s["server"]: s["servid"] for s in SERVERS}


def _servid_from_name(name):
    if not name:
        return 0
    return SERVER_BY_NAME.get(name.lower(), 0)


def _j(v):
    """Serialize dict/list values for JSON columns; pass scalars through."""
    if v is None or isinstance(v, (dict, list)):
        return json.dumps(v) if v is not None else None
    return v


def _num(v):
    """Coerce a string numeric to int/float where safe, else return as-is."""
    if isinstance(v, bool) or v is None:
        return v
    if isinstance(v, (int, float)):
        return v
    s = str(v).strip().replace(",", "")
    if s == "":
        return None
    try:
        return int(s)
    except ValueError:
        try:
            return float(s)
        except ValueError:
            return v


# --------------------------------------------------------------------------
# form parsing helpers
# --------------------------------------------------------------------------
async def _form_field(request: Request, name: str, default=None):
    form = await request.form()
    return form.get(name, default)


async def _form_json(request: Request, name: str = "data"):
    """Decode the `data=<urlencoded JSON>` form field into a Python object."""
    raw = await _form_field(request, name)
    if raw is None:
        return None
    return json.loads(raw)


# --------------------------------------------------------------------------
# static / session endpoints
# --------------------------------------------------------------------------
@app.get("/")
async def health():
    return {"status": "OK", "service": "archangel-bridge"}


@app.get("/dsisscripts/load/getservers")
@app.post("/dsisscripts/load/getservers")
async def getservers():
    # The extension iterates resp.data directly (MakeGmServerJsonObjs),
    # expecting a bare JSON array.
    return JSONResponse(SERVERS)


@app.get("/{dbname}")
async def session_probe(dbname: str):
    # The extension used to probe the DSIS login page at /<dbName>. Answer only
    # for the configured db so stray single-segment GETs (favicon.ico, ...)
    # get a proper 404 instead of a fake OK.
    if dbname != db.DB_NAME:
        return JSONResponse({"status": "ERROR", "error": "unknown db"}, status_code=404)
    return {"status": "OK", "dbName": dbname}


# --------------------------------------------------------------------------
# storage endpoints (preferences / active-scout / bookmarks / spy packets)
# --------------------------------------------------------------------------
@app.post("/dsisscripts/load/savestorage")
async def savestorage(request: Request):
    data = await _form_json(request)
    if not data:
        return {"status": "OK"}
    packets = data.get("Packets", [])
    player_id = data.get("PlayerId")
    for p in packets:
        if not isinstance(p, dict):
            continue
        # The extension's StoragePacket shape: storageKey, storageData, servid, userId
        key = p.get("storageKey") or p.get("Key")
        storage_data = p.get("storageData", p.get("Data"))
        servid = p.get("servid", 0)
        user_id = p.get("userId", player_id)
        storage_type = p.get("storageType", 1)
        if key is None:
            continue
        db.upsert(
            "storage_packets",
            {"servid", "user_id", "storage_key"},
            {
                "servid": servid,
                "user_id": user_id,
                "storage_key": key,
                "storage_type": storage_type,
                "storage_data": _j(storage_data),
            },
        )
    return {"status": "OK"}


@app.post("/dsisscripts/load/getstorage")
async def getstorage(request: Request):
    data = await _form_json(request)
    if not data:
        return {"Packets": [], "Player": {}}
    query_data = data.get("QueryData", [])
    packets = []
    for q in query_data:
        if not isinstance(q, dict):
            continue
        key = q.get("StorageKey")
        servid = q.get("ServId", 0)
        user_id = q.get("UserId", 0)
        if key is None:
            continue
        row = db.query_one(
            "SELECT storage_key, storage_data FROM storage_packets "
            "WHERE servid=%s AND user_id=%s AND storage_key=%s",
            (servid, user_id, key),
        )
        if row:
            # Extension does JSON.parse(d.Data); Data must be the JSON text.
            stored = row["storage_data"]
            data_text = stored if isinstance(stored, str) else json.dumps(stored)
            packets.append({"Key": key, "Data": data_text})
    return {"Packets": packets, "Player": {}}


@app.post("/dsisscripts/load/deletestorage")
async def deletestorage(request: Request):
    data = await _form_json(request)
    if not data:
        return {"status": "OK"}
    key = data.get("StorageKey")
    servid = data.get("ServId", 0)
    user_id = data.get("UserId", 0)
    if key:
        db.execute(
            "DELETE FROM storage_packets WHERE servid=%s AND user_id=%s AND storage_key=%s",
            (servid, user_id, key),
        )
    return {"status": "OK"}


@app.post("/dsisscripts/load/angellog")
async def angellog(request: Request):
    data = await _form_json(request)
    if data:
        db.upsert(
            "error_log",
            set(),
            {
                "servid": data.get("servid", 0),
                "user_id": data.get("userId", data.get("PlayerId", 0)),
                "base_url": data.get("baseUrl"),
                "error_report": _j(data.get("errorReport")),
            },
        )
    return {"status": "OK"}


# --------------------------------------------------------------------------
# dataupload — the big one. Fan out every capture by request.mode.
# --------------------------------------------------------------------------
def _fan_out(item, servid, user_id):
    """Route one upload object to its typed table(s). Always recorded in
    capture_events by the caller. Returns the mode string."""
    # storage-packet shape (bookmarks/spy/scouttime arrive via dataupload too)
    if "storageKey" in item and "storageData" in item:
        key = item.get("storageKey")
        db.upsert(
            "storage_packets",
            {"servid", "user_id", "storage_key"},
            {
                "servid": item.get("servid", servid),
                "user_id": item.get("userId", user_id),
                "storage_key": key,
                "storage_type": item.get("storageType", 1),
                "storage_data": _j(item.get("storageData")),
            },
        )
        return f"storage:{key}"

    # fleet_details arrives under its own top-level key (not request.mode)
    if "fleet_details" in item:
        fd = item["fleet_details"]
        db.upsert(
            "fleet_details",
            {"servid", "fleet_id"},
            {
                "servid": servid,
                "fleet_id": _num(fd.get("fleetId")),
                "details": _j(fd.get("details", [])),
            },
        )
        return "fleet_details"

    req = item.get("request")
    if not isinstance(req, dict):
        return "unknown"

    mode = req.get("mode")
    sending_id = req.get("sendingPlayerId", user_id)
    if mode is None:
        return "unknown"

    try:
        if mode == "base":
            db.upsert(
                "bases",
                {"servid", "coords"},
                {
                    "servid": servid,
                    "user_id": sending_id,
                    "coords": req.get("coords"),
                    "base_id": _num(req.get("base_id")),
                    "base_name": req.get("base_name"),
                    "owner_id": _num(req.get("owner_id")),
                    "owner_name": req.get("ownerName"),
                    "owner_level": _num(req.get("ownerLevel")),
                    "owner_guild_tag": req.get("ownerGuildTag"),
                    "occupier_id": _num(req.get("occupier_id")),
                    "occupier_name": req.get("occupierName"),
                    "occupier_level": _num(req.get("occLevel")),
                    "occupier_guild_tag": req.get("occGuildTag"),
                    "terrain": req.get("terrain"),
                    "debris": _num(req.get("debris")),
                    "structures": req.get("structures"),
                    "structure_levels": req.get("structure_levels"),
                    "construction": req.get("construction"),
                    "production": req.get("production"),
                    "research": req.get("research"),
                    "max_econ": req.get("max_econ"),
                    "current_econ": req.get("current_econ"),
                    "trade": req.get("trade"),
                    "last_pillaged": req.get("last_pillaged"),
                    "stability": req.get("uc_stability"),
                    "wormhole": req.get("wormHole"),
                    "commander": req.get("commander"),
                    "universe_id": req.get("universeId"),
                    "jumpgate": _num(req.get("jumpgate")),
                },
            )

        elif mode == "astro":
            db.upsert(
                "astros",
                {"servid", "coord"},
                {
                    "servid": servid,
                    "user_id": sending_id,
                    "coord": req.get("coord"),
                    "base_id": _num(req.get("baseId", req.get("base_id"))),
                    "owner_id": _num(req.get("ownerId", req.get("owner_id"))),
                    "owner_name": req.get("ownerName"),
                    "owner_guild_tag": req.get("guildTag"),
                    "owner_level": _num(req.get("ownerLevel")),
                    "occ_id": _num(req.get("occId", req.get("occ_id"))),
                    "occ_name": req.get("occName"),
                    "occ_guild_tag": req.get("occGuildTag"),
                    "occ_level": _num(req.get("occLevel")),
                    "terrain": req.get("terrain"),
                    "debris": _num(req.get("debris")),
                    "wormhole": req.get("wormHole"),
                    "has_eyes": 1 if req.get("hasEyes") else 0,
                    "universe_id": req.get("universeId"),
                },
            )

        elif mode == "system":
            system = req.get("system")
            db.upsert(
                "systems",
                {"servid", "system"},
                {
                    "servid": servid,
                    "user_id": sending_id,
                    "system": system,
                    "has_eyes": 1 if req.get("hasEyes") else 0,
                },
            )
            # nested astro0..astroN keys
            for k, v in req.items():
                if k.startswith("astro") and isinstance(v, dict):
                    db.upsert(
                        "system_astros",
                        {"servid", "coord"},
                        {
                            "servid": servid,
                            "system": system,
                            "coord": v.get("coord"),
                            "empty": 1 if v.get("empty") else 0,
                            "terrain": v.get("terrain"),
                            "base_id": _num(v.get("baseId")),
                            "player_id": _num(v.get("playerId")),
                            "wormhole": 1 if v.get("wormhole") else 0,
                            "occ_player_id": _num(v.get("occPlayerId")),
                            "debris": _num(v.get("debris")),
                        },
                    )

        elif mode == "fleet":
            for fl in req.get("fleets", []):
                if not isinstance(fl, dict):
                    continue
                db.upsert(
                    "fleets",
                    {"servid", "fleet_id"},
                    {
                        "servid": servid,
                        "user_id": sending_id,
                        "fleet_id": _num(fl.get("fleetId", fl.get("id"))),
                        "fleetname": fl.get("fleetname"),
                        "player_id": _num(fl.get("player_id")),
                        "guild_tag": fl.get("guildTag"),
                        "location": fl.get("location"),
                        "destination": fl.get("destination"),
                        "arrival": fl.get("arrival"),
                        "size": fl.get("size"),
                        "has_eyes": 1 if fl.get("hasEyes") else 0,
                    },
                )

        elif mode == "fleetDetail":
            for fl in req.get("fleets", []):
                if not isinstance(fl, dict):
                    continue
                db.upsert(
                    "fleet_details",
                    {"servid", "fleet_id"},
                    {
                        "servid": servid,
                        "fleet_id": _num(fl.get("fleetId")),
                        "details": _j(fl.get("details", [])),
                    },
                )

        elif mode == "combat":
            db.upsert(
                "combat_reports",
                {"servid", "location", "battle_time", "att_id", "def_id"},
                {
                    "servid": servid,
                    "user_id": sending_id,
                    "location": req.get("location"),
                    "att_id": _num(req.get("att_id")),
                    "att_level": _num(req.get("att_level")),
                    "def_id": _num(req.get("def_id")),
                    "def_level": _num(req.get("def_level")),
                    "battle_time": req.get("time") or "",
                    "commander": req.get("commander"),
                    "command_centers": req.get("command_centers"),
                    "att_units": _j(req.get("att_units")),
                    "def_units": _j(req.get("def_units")),
                    "att_fleet_loss": _num(req.get("att_fleet_loss")),
                    "def_fleet_loss": _num(req.get("def_fleet_loss")),
                    "att_xp": _num(req.get("att_xp")),
                    "def_xp": _num(req.get("def_xp")),
                    "debris": _num(req.get("debris")),
                    "pillage": _num(req.get("pillage")),
                    "conquered": _num(req.get("conquered")),
                    "commanders_killed": _num(req.get("commanders_killed")),
                },
            )

        elif mode == "profile":
            db.upsert(
                "profiles",
                {"servid", "player_id"},
                {
                    "servid": servid,
                    "player_id": _num(req.get("player_id", req.get("id"))),
                    "player_name": req.get("player_name"),
                    "guild_tag": req.get("guild_tag"),
                    "guild_id": _num(req.get("guild_id")),
                    "guild_name": req.get("guild_name"),
                    "level": _num(req.get("level")),
                    "inactive_days": req.get("inactive"),
                    "days_in_vac": req.get("daysinvac"),
                },
            )

        elif mode == "guild":
            db.upsert(
                "guilds",
                {"servid", "guild_id"},
                {
                    "servid": servid,
                    "guild_id": _num(req.get("guildId")),
                    "guild_name": req.get("guildName"),
                    "guild_tag": req.get("guildTag"),
                },
            )
            for m in req.get("members", []):
                if not isinstance(m, dict):
                    continue
                db.upsert(
                    "guild_members",
                    {"servid", "guild_id", "player_id"},
                    {
                        "servid": servid,
                        "guild_id": _num(req.get("guildId")),
                        "player_id": _num(m.get("playerId")),
                        "nick": m.get("nick"),
                        "level": _num(m.get("level")),
                    },
                )

        elif mode == "technology":
            for t in req.get("techs", []):
                if not isinstance(t, dict):
                    continue
                db.upsert(
                    "technologies",
                    {"servid", "user_id", "tech"},
                    {
                        "servid": servid,
                        "user_id": sending_id,
                        "tech": t.get("tech"),
                        "level": t.get("level"),
                    },
                )

        elif mode == "capacities":
            db.upsert(
                "capacities",
                {"servid", "user_id"},
                {
                    "servid": servid,
                    "user_id": sending_id,
                    "economy": req.get("economy"),
                    "construction": req.get("construction"),
                    "production": req.get("production"),
                    "research": req.get("research"),
                },
            )

        # fake_list, systemdata, invalid_base, invalidPlayer, and any future
        # modes: captured verbatim in capture_events only (no typed table).
    except Exception as e:  # never let one bad row kill the whole upload
        log.exception("fan-out error for mode=%s", mode)

    return mode


@app.post("/{dbname}/parse/dataupload")
async def dataupload(dbname: str, request: Request):
    raw = await _form_field(request, "data")
    server = await _form_field(request, "server", "")
    sending_id = _num(request.query_params.get("sendingPlayerId", 0)) or 0
    servid = _servid_from_name(server)

    if not raw:
        return {"status": "OK"}

    try:
        items = json.loads(raw)
    except (TypeError, ValueError):
        return {"status": "error", "error": "invalid data field"}

    if not isinstance(items, list):
        items = [items]

    for item in items:
        if not isinstance(item, dict):
            continue
        # fake_list is a trap to catch bots/scripts. Never parse, store, or
        # refer to it — drop the item entirely (don't even log to capture_events).
        req = item.get("request")
        if isinstance(req, dict) and req.get("mode") == "fake_list":
            continue
        mode = _fan_out(item, servid, sending_id)
        db.upsert(
            "capture_events",
            set(),
            {
                "servid": servid,
                "user_id": sending_id,
                "mode": mode,
                "payload": _j(item),
            },
        )

    return {"status": "OK"}


# --------------------------------------------------------------------------
# parse/script — query handlers (used by gates / player_summary / scouting)
# --------------------------------------------------------------------------
@app.post("/{dbname}/parse/script")
async def parse_script(dbname: str, request: Request):
    data = await _form_json(request)
    req = (data or {}).get("request", {})
    mode = req.get("mode", "")
    # NOTE: parse/script requests carry no server name (only the dbName path
    # segment), so these queries are not server-scoped. Fine while Helion is
    # the only seeded server; revisit if SERVERS grows.

    def result(payload):
        # The extension's DsisRequests.MakeRequest already wraps the HTTP body
        # in {status:'OK', data: <body>} before handing it to the caller, and
        # every parse/script caller reads response.data.<field> directly. So the
        # body must be the bare payload — NOT wrapped in {status:'OK', data:...}
        # (that would double-wrap and make response.data.<field> undefined).
        return payload

    if mode == "jg_search":
        # Closest/fastest jump-gate route. With no gate data yet, return the
        # destination unchanged, matching the extension's "no result" branch.
        return result({"result": req.get("dloc"), "jgDetails": ""})

    if mode == "getFastestJgByRegion":
        rows = db.query(
            "SELECT LEFT(coords,6) AS region, MAX(jumpgate) AS jg, "
            "SUBSTRING_INDEX(GROUP_CONCAT(coords ORDER BY jumpgate DESC), ',', 1) AS location "
            "FROM bases WHERE jumpgate > 0 GROUP BY region"
        )
        return result({"regions": rows})

    if mode == "getGates":
        # guildid comes from the owner's profile (the original DSIS query joined
        # bases to players on ownerplayerid); unknown until a profile is captured.
        rows = db.query(
            "SELECT b.coords AS location, b.jumpgate, b.base_id AS baseid, "
            "b.owner_id AS ownerplayerid, p.guild_id AS guildid, 0 AS vacation "
            "FROM bases b LEFT JOIN profiles p "
            "ON p.servid = b.servid AND p.player_id = b.owner_id "
            "WHERE b.jumpgate > 0"
        )
        return result({"gates": rows})

    if mode == "getGuildGates":
        rows = db.query(
            "SELECT b.coords AS location, b.jumpgate AS jumpGate, b.owner_name AS nick, "
            "b.owner_guild_tag AS guildTag, b.base_id AS baseId, p.guild_id AS guildid "
            "FROM bases b LEFT JOIN profiles p "
            "ON p.servid = b.servid AND p.player_id = b.owner_id "
            "WHERE b.jumpgate > 0"
        )
        return result({"bases": rows})

    if mode == "getGuildSystems":
        return result({"systems": []})

    if mode == "player_summary":
        return result(
            {"tech": [], "bases": [], "players": [], "fleets": [], "comments": []}
        )

    # invalid_base / invalidPlayer / systemdata / fake_list / unknown
    return result({})


@app.get("/{dbname}/parse/superscanners")
@app.post("/{dbname}/parse/superscanners")
async def superscanners(dbname: str):
    # Guild scanner fleets — crowd-sourced; empty locally.
    return {"status": "OK", "data": {"data": []}}
