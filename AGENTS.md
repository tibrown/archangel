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
- Only server seeded: **Helion** (`helion.astroempires.com`), servid 1.
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
  server-scoped (fine while Helion is the only server).

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
