# DSIS Archangel — Local MySQL Port — Load & Capture Test Checklist

Target: Chrome Manifest V3 on **geekom**, extension loaded unpacked, data flowing to the bridge on **timsmini** at `http://marjis.com:8010` (geekom resolves `marjis.com` → timsmini). Commands below marked *(timsmini)* run on the bridge host; *(geekom)* in Chrome.

---

## 0. Pre-flight (before touching Chrome)

All `mysql` commands in this document run on **timsmini** (MariaDB is bound to loopback there).

```bash
# (timsmini) bridge service up and bound to all interfaces
systemctl --user is-active archangel-bridge && ss -ltn | grep ':8010'
curl -s http://127.0.0.1:8010/ | python3 -m json.tool
# expect: {"status":"OK","service":"archangel-bridge"}

# (geekom) the alias + firewall path actually works from the browser host
curl -s http://marjis.com:8010/
# expect the same {"status":"OK",...}; if this fails, nothing else will work

# And serving the server list
curl -s http://marjis.com:8010/dsisscripts/load/getservers
# expect: [{"server":"helion","servid":1,"galaxyData":null}]

# MariaDB up and reachable
mysql -h127.0.0.1 -uarchangel -p'[REDACTED]' archangel -e "SHOW TABLES;"
# expect: 16 tables (astro, capture_events, fleet, fleet_details, system, ...)
```

If the bridge is down, restart it (see `AGENTS.md` for the exact command/venv path).

---

## 1. Load the unpacked extension

1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top-right) ON.
3. Click **Load unpacked**.
4. Select the `extension/` directory of a checkout of this repo on geekom (the one containing `manifest.json`).
5. Confirm "DSISArchangel 0.3.0" appears with a lightning icon and **no red error banner**.

### If a load error appears
The banner text names the exact problem. Most likely candidates, in order:
- **"Service worker registration failed"** → open the SW's "Errors" link and read the console. A `ReferenceError` here means the 17-file `importScripts()` chain references a global before its defining file loads. Note the exact symbol and file.
- **"Could not load manifest"** → `manifest.json` is malformed. Re-run `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8'))"`.
- **"Could not load icon"** → `icons/lightning.png` missing/corrupt.

---

## 2. Inspect the service worker

1. On the extension card, click **"service worker"** (blue link). This opens DevTools → Console for `background/background.js`.
2. Confirm there is **no red error** and ideally a startup log line (`lg.log(...)` or similar) at the top.

### What to look for specifically
- **`importScripts` load order errors** — any `X is not defined` / `Unexpected identifier` in the first lines = a missing or out-of-order file in the `importScripts([...])` list in `background/background.js`. This is the single highest-risk part of the port.
- **`chrome.sidePanel.close is not a function`** — should NOT appear (already removed).
- **`$.ajax is not defined`** in the SW — should NOT appear (jQuery intentionally dropped from background; `dsis-io.js`/`dsisRequests.js` use `fetch` now).
- **`Mixed Content: The page at 'https://…astroempires.com/…' was loaded over HTTPS, but requested an insecure resource 'http://marjis.com:8010/…'`** in the *page* console — means a content script is fetching the bridge directly instead of relaying via the `BridgeFetch` message. Find the call site; it must go through `dsisReq.MakeRequest` / `dsisU.DoAjax`.

If the SW is healthy, you may also see a seed line confirming `SeedLocalServers()` ran without error.

---

## 3. Open the UI surfaces (each should load without console errors)

| Surface | How to open | Expected |
|---|---|---|
| Side panel | `chrome://extensions` → "DSISArchangel" → **Open side panel**, or the action button | Panel renders, no `getBackgroundPage is not a function` |
| Options | Right-click extension icon → **Options** (or `chrome://extensions` → Details → Extension options) | "Archangel Options" page, color pickers render |
| Empire Fleet | `chrome://extensions` → Details → **Inspect views** (only after a fleet page is open) | Fleet table UI |
| Status Log / Super Scanners / Mail Room | Popup views launched from within an AE game page | Respective UI renders |

The sidebar/options pages must reach the background through the `UIBridge` message handler. If a page hangs at "getting background…" or logs `Error getting background`, the `UIBridge` handler isn't responding — check the SW console for errors on the `UIBridge` branch of the `onMessage` listener.

---

## 4. Live capture test (the real goal)

1. In Chrome, log into `https://helion.astroempires.com` (create an account if needed — you said you don't have one yet).
2. Open your **empire/overview page** and the **map** (`map.aspx`), which are the primary capture surfaces.
3. Watch the DB (in a second terminal, or refresh after a moment):

```bash
mysql -h127.0.0.1 -uarchangel -p'[REDACTED]' archangel -e \
  "SELECT COUNT(*) AS n, table_name FROM information_schema.tables
   WHERE table_schema='archangel'
   GROUP BY table_name ORDER BY table_name;"
```

And specifically — `capture_events` catches **everything verbatim**, so it's the canary:

```bash
mysql -h127.0.0.1 -uarchangel -p'[REDACTED]' archangel -e \
  "SELECT COUNT(*) AS captured FROM capture_events;"
```

If that number goes up after you load an AE page, the whole pipeline works end-to-end: content script → port/message → background SW → `uploader.js`/`dsis-io.js` → `fetch` to `marjis.com:8010` → PyMySQL → MariaDB.

---

## 5. Verify data landed in the typed tables (not just the verbatim log)

```bash
mysql -h127.0.0.1 -uarchangel -p'[REDACTED]' archangel -e \
  "SELECT 'astro' t, COUNT(*) n FROM astro
   UNION ALL SELECT 'system', COUNT(*) FROM system
   UNION ALL SELECT 'fleet', COUNT(*) FROM fleet
   UNION ALL SELECT 'fleet_details', COUNT(*) FROM fleet_details
   UNION ALL SELECT 'technology', COUNT(*) FROM technology
   UNION ALL SELECT 'profile', COUNT(*) FROM profile;"
```

Non-zero counts in `astro`/`system`/`profile` (from your own empire) are the success signal. `fleet`/`fleet_details` require a fleet page to be open.

---

## 6. Confirm the DSIS-session gate is truly bypassed

In the SW console, when you load an AE page, look for a line indicating `EnsureLocalDsis` ran (the synthesized `dsisServer` with `dbName='archangel'`, `dsisHost='marjis.com:8010'`). If capture is working (step 4/5 non-zero), the gate is bypassed — the extension would otherwise refuse to upload because the dead `*.angeldsis.com` backend never signals a session.

---

## 7. Known limitations (expected, not bugs)

- **Query features return stubs/empty**: jump-gate search (`jg_search`), route-finding, and Super Scanners queries need a populated gate/bases dataset before they return real data. They will not crash — they return empty/stub results.
- **`parse/script` is a stub** in `bridge/app.py` — no server-side computation yet.
- **Content scripts keep jQuery** (correct — the background SW does not, and must not, reference it).
- **CRLF line endings** — the files are CRLF (Windows-style), which is fine for Chrome; just don't re-save them as LF+spurious diffs when editing.

---

## 8. If something fails — the debug order

1. **Read the SW console first** (step 2). The specific error message is the root cause; don't guess.
2. **Check the bridge log** (uvicorn process on 8010) — did the request arrive? Did PyMySQL throw?
3. **Check `capture_events`** — if it's growing, capture works and the issue is downstream typing; if empty, the break is extension→bridge.
4. **Reproduce with a fresh AE page load**, not a cached one.

Report back with: the exact console error (SW console), the bridge log tail, and the `capture_events` count before/after. That trio localizes any failure to exactly one layer.
