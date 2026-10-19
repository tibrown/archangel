# archangel — DSIS Archangel local port

## What this is
A rewrite of the **DSIS Archangel v0.2.4** browser extension (Astro Empires
data-capture tool) so that everything it captures lands in a **local
MariaDB/MySQL database** instead of the dead remote server `klingon.angeldsis.com`.

Two components:
- `bridge/` — a FastAPI + PyMySQL app that mirrors the exact endpoints the
  extension already calls (`savestorage`, `getstorage`, `deletestorage`,
  `angellog`, `dataupload`, `parse/script`, `getservers`), persisting to MySQL.
- `extension/` — the ported browser extension (Chrome MV3 target), with upload
  URLs pointed at the local bridge.

## Database
- Host: `127.0.0.1:3306`, database `archangel`, user `archangel`.
- Credentials live in `bridge/.env` (gitignored) as `ARCHANGEL_DB_*` vars.
  Template: `bridge/.env.example`. Do NOT commit the real `.env`.
- Schema: `bridge/schema.sql` (16 tables). Charset `utf8mb4` / `utf8mb4_unicode_ci`.
- Apply: `cd bridge && set -a && . ./.env && set +a && mysql -h "$ARCHANGEL_DB_HOST" -u "$ARCHANGEL_DB_USER" -p"$ARCHANGEL_DB_PASSWORD" "$ARCHANGEL_DB_NAME" < schema.sql`

## Topology (two hosts)
- **timsmini** (this box, `tim-UM590`): runs MariaDB and the bridge.
- **geekom**: runs Chrome with the extension. It has a hard-coded hosts alias
  `marjis.com` → timsmini, so the extension targets `http://marjis.com:8010`.
- Therefore the bridge binds `0.0.0.0:8010` (not loopback), and the
  extension's bridge address lives in ONE place: `extension/common/bridge-config.js`
  (`BRIDGE_HOST`). `manifest.json` `host_permissions` must list the same host.

### Mixed content — why content scripts relay through the service worker
The game is `https://`; the bridge is plain `http://`. Chrome exempts
`127.0.0.1` from mixed-content blocking but NOT other hosts, so a `fetch()`
from a content script to `http://marjis.com:8010` is blocked. All content-script
bridge calls (`common/dsisRequests.js`, `content/dsisU.js`) therefore send a
`BridgeFetch` message to `background/background.js`, which performs the fetch
from the extension origin (exempt, and covered by `host_permissions`).
Extension pages (sidebar, options, contextMenu) and the SW fetch directly.

## Running the bridge
It is a systemd **user** service (`bridge/archangel-bridge.service`, symlinked
into `~/.config/systemd/user/`). `bridge/start.sh` sources `.env`, waits for
MariaDB (`wait_for_mysql`), then execs uvicorn in the foreground.
```bash
systemctl --user status archangel-bridge
systemctl --user restart archangel-bridge
journalctl --user -u archangel-bridge -n 50
```
Manual run (dev only): `cd bridge && ./start.sh` (honours `BRIDGE_BIND`/`BRIDGE_PORT` from `.env`).

**Port is 8010, NOT 8000.** 8000 is already taken on this host by another app
("Marji's Business API" / birdhousecreations).

Deps (see `bridge/requirements.txt`): `fastapi`, `uvicorn[standard]`, `pymysql`,
`python-multipart` (the last one is required for `request.form()` parsing — the
extension POSTs `application/x-www-form-urlencoded`; without it FastAPI raises
"python-multipart library must be installed").

## Testing
```bash
cd bridge && ./test_suite.sh
```
24 assertions covering every capture mode (`base`, `astro`, `system`, `fleet`,
`fleet_details`, `combat`, `profile`, `guild`, `technology`, `capacities`,
storage packets, error log, query handlers, getservers). The suite truncates all
tables at the start, so it's idempotent.

## Reports
Query captured data without touching the bridge HTTP API — `reports/report.py`
reuses `bridge/db.py` (auto-reads `bridge/.env`) and prints Markdown:
```bash
bridge/.venv/bin/python reports/report.py bases   # every base + structure levels
bridge/.venv/bin/python reports/report.py recorded_bases  # scout/recorded bases: astro attrs + defenses + staleness
```
- Use the **bridge venv python** (`bridge/.venv/bin/python`) — the system python
  has no `pymysql`.
- Each report is a `report_<name>()` function registered in `reports/report.py`'s
  `REPORTS` dict; it calls `db.query(...)` and prints a Markdown table.
- A Hermes skill `archangel-reports` documents this for the agent.
- Don't run reports while `bridge/test_suite.sh` is truncating tables.

## Web reports UI (`webapp/`)
A read-only web frontend for browsing/querying every table with robust
per-column filtering, global search, sorting, pagination, and CSV export.
- **Location:** `webapp/` — FastAPI backend (`webapp/app.py`) + vanilla
  single-page frontend (`webapp/static/`). No build step.
- **Port:** `8020`, bound `0.0.0.0` (LAN-reachable). No auth (LAN-open).
- **Run:** systemd **user** service `archangel-webapp.service` (symlinked into
  `~/.config/systemd/user/`). `webapp/start.sh` sources `../bridge/.env`, waits
  for MariaDB, then execs the **bridge venv** uvicorn
  (`../bridge/.venv/bin/uvicorn app:app --app-dir ...`).
  ```bash
  systemctl --user status archangel-webapp
  systemctl --user restart archangel-webapp
  journalctl --user -u archangel-webapp -n 50
  ```
  **Restart rule:** after ANY change to `webapp/app.py` or `bridge/app.py`, restart
  the service — the live web must always run current code (a browser refresh only
  refreshes data, not code).
- **Read-only by construction:** only `SELECT` is issued; table/column names are
  validated against `information_schema` before any SQL interpolation; all user
  values are bound as `%s` params. Reuses `bridge/db.py` (auto-reads
  `bridge/.env`), so no separate venv or creds.
- **Server join:** every table with a `servid` FK is `LEFT JOIN`ed to the
  `servers` table and exposes a virtual `server` column (the server *name*).
  The UI shows `server` first and hides the raw `servid` by default (re-enable
  via the Columns menu). `server` is filterable and sortable (mapped to
  `s.server_name`), and is included in global search and CSV export.
- **API:** `GET /api/tables` (tables + row counts + column metadata, incl. the
  virtual `server`), `GET /api/servers`, `GET /api/tables/{t}/rows` (params:
  `q` global search, `filters` = repeated JSON `{field,op,value[,value2]}`,
  `sort`/`order`, `limit`/`offset`, `server`), `/api/tables/{t}/rows/{id}`,
  `/api/tables/{t}/export.csv` (capped 10k rows).
- JSON/blob columns are returned parsed and rendered as expandable cells.
- Empty filter values are no-ops (never silently return 0 rows).

## Wire format (for anyone extending the bridge)
All POST bodies are `application/x-www-form-urlencoded`:
- storage/angellog endpoints: single field `data=<urlencoded JSON>` with `PlayerId` injected.
- `dataupload`: fields `data=<JSON array string>` + `server=<serverName>`; query param `sendingPlayerId`.
- `parse/script`: single field `data=<urlencoded JSON>` of `{request:{mode,...}}`.

`dataupload` carries three distinct payload shapes per array element:
1. `{request: {mode: "base"|"astro"|...}}` → typed table.
2. `{fleet_details: {...}}` → fleet_details table.
3. `{storageKey, storageData, ...}` (StoragePacket) → storage_packets (bookmarks/
   spy findings / scout-time arrive via dataupload, not savestorage).

Every element is ALSO logged verbatim to `capture_events` (lossless fallback).

## Key facts
- Server registry is DB-backed and auto-registering: the bridge seeds **Helion**
  (`helion`, servid 1) on first boot to preserve legacy rows, then any
  `*.astroempires.com` server gets its own row + next-free servid the first time
  its name appears in a `dataupload`. `getservers` returns the whole `servers`
  table, so the extension learns every registered server. `econs.GetGmServer()`
  falls back to a name-only GmServer (bridge resolves servid by name on upload).
- Astro Empires coords are 12 chars (`A00:00:00:00`), NOT 10 — schema uses CHAR(12).
- `astro.wormhole` is a date string (VARCHAR(16)), but `system_astros.wormhole`
  is a 0/1 boolean (TINYINT) — different, don't conflate.
- MySQL normalizes stored JSON (adds spaces), so grep tests must not expect
  exact `"key":value` spacing.
- `fleets` is one-row-per-fleet (`UNIQUE (servid, fleet_id)`, refreshed on
  re-sighting), NOT a sighting history. `combat_reports` dedupes on
  `(servid, location, battle_time, att_id, def_id)`; `battle_time` is `''`
  (never NULL) so the unique key holds.
- `getGates`/`getGuildGates` take `guildid` from `profiles.guild_id` via a LEFT
  JOIN on the base owner — it is NULL until that player's profile is captured.
- `parse/script` requests carry no server name, so those queries are not
  server-scoped (they return combined data across all registered servers; fine
  while Helion is the dominant server, revisit if you need per-server gates).

## Critical invariants (do not break)
- **`fake_list` is a honeypot — never touch it.** A decoy "capture mode" the AE
  server uses to catch bots/scripts. Never parsed, stored, or referred to at any
  layer. Dropped in BOTH `extension/content/parse.js` (never collected) and
  `bridge/app.py` (hard `continue` before `_fan_out`/`capture_events`).
- **Update only what's present — never blank a column a parser didn't send.**
  The bridge `base` handler builds its upsert from the request keys that are
  PRESENT, not from a fixed column list. A recorded/scout capture omits
  live-only fields (construction/production/research/economy), so those keep
  their existing value; a key that IS present but empty (parser observed a
  removal) still writes through. Each parser sends ONLY the fields it owns:
  `ParseRecordedBase` sends astro attributes + defenses + staleness, never the
  live-only economy rows. Keep this present-key-only rule for any new mode.
- **Recorded/scout base pages are captured, not skipped.** `ParseBase` detects
  `Recorded data from` (against the live DOM for manual view, the fetched
  fragment for autoscout) and delegates to `ParseRecordedBase`, which stores
  astro_type/area/solar_energy/fertility/metal/gas/crystals/defenses/
  recorded_days_ago in `bases`. These columns were added via idempotent
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` at the end of `bridge/schema.sql`
  (a fresh `CREATE TABLE IF NOT EXISTS` won't upgrade an existing DB).
- **Never write to the game DOM while a spy script is present.** The server
  randomly injects spy scripts (markers `js_jquery_debug` and `debug.aspx` in
  fetched HTML) that copy the DOM and post it back to catch page-modifying
  extensions. `content/SpyDetect.js` sets a sticky `IsSpyFound()` flag
  (`window.sessionStorage` for synchronous per-tab reads, mirrored to
  `chrome.storage.local` to survive reload — content scripts cannot use
  `chrome.storage.session`, that throws "Access to storage is not allowed from
  this context"); every UI-injection entry point is
  gated on it (`BuildHints`, `pageUI.UpdatePage`, the content `DTimer`,
  `Gather.DoGather`).
- **Defensive regex parsing — use `safeMatch()`.** `common/classes.js` defines
  `safeMatch(source, re, idx)`, returning `''` on a null source or no-match
  instead of throwing. Use it in place of raw `source.match(re)[n]` /
  `re.exec(source)[n]` when reading page-scraped strings, so DOM drift can't
  crash a content script.

## DSIS-session gate (must be bypassed in the port)
The extension does NOT simply upload to a URL. It derives its entire runtime
config from a DSIS website login page and refuses to capture without it:
- `content/dsis-content.js` reads `dbName`, `dsisHost`, `playerId`, `disabled`
  from hidden form fields (`#DSISDbName`, `#DSISPlayerId`, `#DSISDisabled`) on
  the DSIS site, then fires `DSISSiteFound`.
- `background/bg-comms.js` blocks capture with "No DSIS Site is Active" when no
  DSIS session exists.
- `background/BgFuncs.js` hardcodes `http://klingon.angeldsis.com/dsisscripts/load/getservers`
  and `.../angellog` (bypassing the configurable `dsisHost`).

The port must (a) repoint the hardcoded `getservers`/`angellog` URLs to the
bridge, and (b) inject a local DSIS config (dbName=`archangel`,
dsisHost=`127.0.0.1:8010`, playerId from the AE page) without requiring the dead
site, plus bypass the `CheckDsisSession`/`#DSIS-Main` HTML check (the bridge
returns JSON, not the DSIS login page HTML).

## Git
Public repo. `extension/` is the ported tree; `.extracted/` (raw XPI
extraction, kept locally for diffing), `.venv/`, `__pycache__` and `bridge/.env`
are gitignored. The original `dsis_archangel-latest.xpi` is committed as the
provenance artifact. Never commit `bridge/.env`.
