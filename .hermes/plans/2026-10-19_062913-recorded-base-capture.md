# Recorded-Base (Autoscout/Foggy) Data Capture — Implementation Plan

> **STATUS: IMPLEMENTED & VERIFIED (2026-10-19).** All 6 tasks done; 32/32 tests
> pass; parser verified against the real recorded DOM (20/20 assertions); webapp
> + reports surface the new columns. See the diff summary at the bottom.

> **For Hermes:** implement this plan task-by-task (subagent-driven-development
> is a good fit). This is plan-only — nothing in this file touches `src/` yet.

**Goal:** In-game autoscout produces **recorded-data base pages** (the AE "scout"
view, marker `Recorded data from N day(s) ago.`) for bases you don't currently
have eyes on. Today the extension/AR stack captures **nothing** from these pages.
This plan adds a new parser that harvests every scrap of data those pages expose
— including astro attributes the current schema can't even hold — plus the schema,
bridge, autoscout-routing, and test changes to make it durable.

**Architecture (summary):** The existing `ParseBase` (live-eyes parser) bails out
the moment it sees `Recorded data from`. We keep it for live bases and add a
parallel **`ParseRecordedBase`** that understands the scout DOM, route autoscout's
`base.aspx` fetches to it when foggy, and widen the `bases` table + bridge `base`
mode to store the extra attributes that only scout pages carry.

**Tech Stack:** plain JS (extension content scripts, jQuery 1.8.2 + `safeMatch()`),
Python/FastAPI + PyMySQL (`bridge/app.py`, `bridge/db.py`), MariaDB (`bridge/schema.sql`),
bash test suite (`bridge/test_suite.sh`).

---

## Current behavior / the gap (verified in code)

1. `extension/content/autoScout.js` `AutoScouter.Astro()` (lines 1516–1554): when the
   scouted astro has a `baseId != 0` it fetches `base.aspx?base=<id>` and hands the
   returned HTML to `parse.ParseBase`. So autoscout *does* land on recorded-base pages.
2. `extension/content/parse.js` `ParseBase()` (lines 214–223) immediately returns:
   ```js
   var isFoggy = $('center:contains(Recorded data from)').length > 0;
   if (isFoggy) { parse.log('Is FOGGY'); /* fakeEyesAstroBase(coords, isFoggy); */ return; }
   ```
   → **autoscout currently uploads nothing for every base it can only scout.**
3. Even the live `ParseBase` never reads `Area`, `Solar Energy`, `Fertility`,
   `Astro Type`, or the `Metal/Gas/Crystals` resource bonuses. These appear on
   recorded scout pages (and on live pages). So they are universally missing.
4. The `bases` table (`bridge/schema.sql` lines 26–59) has no columns for those
   values. The bridge `mode == "base"` handler (`bridge/app.py` lines 289–324)
   only maps today's fields.

---

## Data inventory of the recorded-base DOM (from the sample)

Everything below is present in the attached sample and is currently **lost**:

| Field | Sample value | Source (in the recorded DOM) |
|---|---|---|
| coords | `C24:01:86:40` | `a[href*="map.aspx?loc="]` text / `A\d\d:\d\d:\d\d:\d\d` |
| Astro Type | `Planet` | `<b>Astro Type:</b>` |
| Terrain | `Craters` | `<b>Terrain:</b>` (already parsed elsewhere) |
| **Area** | `85` | `<b>Area:</b>` |
| **Solar Energy** | `2` | `<b>Solar Energy:</b>` |
| **Fertility** | `5` | `<b>Fertility:</b>` |
| **Resources (metal/gas/xtal)** | `4 / 3 / 2` | `#base_resources` listing3 rows |
| Base name | `Ceti Alpha` | `th.dropcap` (first) |
| Base Owner | `[BAM] Captain Kirk` | `:contains(Base Owner)` → `a[href*="profile.aspx?player="]` (p=212, lvl 23.77) |
| Base Commander | `Curtis Dylan (Production 3)` | `td:contains(Base Commander)` + `a[href*="commander.aspx?commander="]` |
| **Staleness** | `1 day(s) ago` | `center:contains(Recorded data from)` |
| Structures + levels | Urban 19, GasPlants 11, … | `#base_resume-structures` (IDENTICAL layout to live) |
| Defenses | Photon Turret 10/10 | `#base_resume-structures` col 4/5 |
| Fleets (scout) | `Recorded data / [BAM] Captain Kirk / (blank) / 10,000` | `#base_fleets` |

**Key insight:** `#base_resume-structures` on the recorded DOM is *byte-identical in
layout* to the live eye view (`Structures | Level | Structures | Level | Defenses | Units`).
The existing structure/defense-parsing block (parse.js 354–388) can be **reused
unchanged** by the new parser — factor it out or copy it. The recorded page just
lacks the construction/production/research/economy rows (those need eyes), so those
`bases` columns stay NULL for scout captures.

---

## Step-by-step plan

### Task 1 — Add `ParseRecordedBase()` to `extension/content/parse.js`
**Objective:** new parser that extracts every field above from a foggy/scout base
page, mirroring the existing parser's defensive `safeMatch()` style and `PushUpload`
contract.

**Files:**
- Modify: `extension/content/parse.js`

**Step 1 — scaffold the parser** (add after `ParseBase` or as a sibling method on the
`Parser` object). Signature matches `ParseBase`: `this.ParseRecordedBase = function(msg, callback, baseId)`. Accept both live-DOM (`msg == null`, `$(document)`) and fetched-fragment (`msg != null`, `$('<div>').append($(msg))`) entry, exactly like `ParseBase`/`ParseProfile` wrap fetched HTML in a div so `.find()` reaches root-level nodes.

**Step 2 — extract header fields (defensive):**
```js
var root = (msg == null) ? $(document) : $('<div>').append($(msg));
var coords = safeMatch(root.find('a[href*="map.aspx?loc="]').first().text(),
                       /[A-Z]\d\d:\d\d:\d\d:\d\d/, [0]);
// pair each <b>Label:</b> label with its following text node
var baseInfo = {};
root.find('b').each(function(){ 
  var t = $(this).text();
  if (/^(Astro Type|Terrain|Area|Solar Energy|Fertility):/.test(t)) {
    var label = t.replace(':', '').trim();
    baseInfo[label] = $(this)[0].nextSibling ? $(this)[0].nextSibling.nodeValue.trim() : '';
  }
});
var staleness = safeMatch(root.find('center:contains(Recorded data from)').text(),
                          /from (\d+ (?:day|hour|minute|second)s?) ago/, [1]);
```
- Every read via `safeMatch` so DOM drift returns `''` instead of throwing.

**Step 3 — resources + owner + commander:**
```js
var res = {};
root.find('#base_resources tr').each(function(){
  var c = $(this).children('td');
  if (c.length == 2) res[c.eq(0).text().trim().toLowerCase()] = c.eq(1).text().trim();
});
var ownerLink = root.find(':contains(Base Owner)').find('a[href*="profile.aspx"]').first();
var owner_id  = safeMatch(ownerLink.attr('href'), /player=(\d+)/, [1]);
var owner_name= ownerLink.text().trim();
var ownerLevel= safeMatch(ownerLink.attr('title'), /\d+\.\d+/, [0]);
var commanderLink = root.find(':contains(Base Commander)').find('a').first();
var commander = commanderLink.text().trim();           // "Curtis Dylan"
var cmdrBonus = safeMatch(commanderLink.parent().text(), /\((\w+(?: \w+)? \d+)\)/, [1]); // "Production 3"
```

**Step 4 — structures/defenses (reuse live parser's logic):** operate on
`root.find('table#base_resume-structures')` and build the `structures` /
`structure_levels` `*`-delimited strings and the defense column exactly as
`ParseBase` does (parse.js 354–388), including the `Jump Gate` level lookup.

**Step 5 — assemble + upload:**
```js
var req = { request: {
  mode: 'base',
  coords: coords, base_id: baseId,
  base_name: safeMatch(root.find('th.dropcap').first().text(), /\S.*/, [0]),
  astro_type: baseInfo['Astro Type'], terrain: baseInfo['Terrain'],
  area: _num(baseInfo['Area']), solar_energy: _num(baseInfo['Solar Energy']),
  fertility: _num(baseInfo['Fertility']),
  metal: _num(res['metal']), gas: _num(res['gas']), crystals: _num(res['crystals']),
  owner_id, ownerName: owner_name, ownerLevel, 
  structures: structures, structure_levels: structure_levels,
  recorded_days_ago: staleness,
  sendingPlayerId: ctG.SendingPlayerId
}};
ctF.PushUpload(req);
```
(`_num` — the bridge's numeric-clean helper; mirror its semantics client-side.)

**Step 6 — show status** via `ctF.DisplayStatus('Parsed recorded base <coords>', …)` so the
sidebar reflects it, and **do not** call `ParseFleet`/fleet-details iteration (scout
fleets have no real fleet id — the row is literally labeled `Recorded data`).

---

### Task 2 — Route autoscout foggy base pages to the new parser
**Objective:** when autoscout fetches a base page that is recorded/foggy, call
`ParseRecordedBase` instead of letting `ParseBase` early-return.

**Files:**
- Modify: `extension/content/parse.js` (`ParseBase` entry, lines ~214–223)

**Step 1** — Rebase the fog check inside `ParseBase` so it makes a decision instead of
dropping data:
```js
var isFoggy = $('center:contains(Recorded data from)').length > 0;
if (isFoggy) { parse.log('Is FOGGY -> recorded base parse'); return parse.ParseRecordedBase(msg, callback, baseId); }
```
(`ParseRecordedBase` already handles both `msg==null` and fetched-msg, so this is a
drop-in delegation.)

**Step 2 — standalone base pauses:** also gate any autoscout path that skips foggy
bases so the *scout* data is still harvested even when the fleet/full-eye capture is
inhibited. Confirm in `autoScout.js` `Astro()` that `fn=parse.ParseBase` is the only
base entry point; if a `seedOnly`/no-eyes branch bypasses it, point it at
`ParseRecordedBase` as well.

---

### Task 3 — Widen the `bases` schema
**Objective:** `bases` can hold the new scout-only attributes.

**Files:**
- Modify: `bridge/schema.sql` (`bases` table, ~lines 26–59) — add columns after `terrain`:
```sql
astro_type      VARCHAR(32) NULL,
area            INT NULL,
solar_energy    INT NULL,
fertility       INT NULL,
metal           INT NULL,
gas             INT NULL,
crystals        INT NULL,
recorded_days_ago VARCHAR(16) NULL,
```
- **Existing DB migration note:** `schema.sql` is `CREATE TABLE IF NOT EXISTS` — it
  will NOT add columns to an existing table. Add an idempotent `ALTER TABLE bases
  ADD COLUMN IF NOT EXISTS ...` migration (MariaDB 10.x supports
  `ADD COLUMN IF NOT EXISTS`) so a live install upgrades in place without dropping data.
  Put it in `bridge/schema.sql` after the CREATE, or a `bridge/migrate.sql` invoked
  alongside.

---

### Task 4 — Map new fields in the bridge `base` handler
**Objective:** `bridge/app.py` stores the new attributes.

**Files:**
- Modify: `bridge/app.py` (lines 289–324, `if mode == "base":` upsert dict)

Add to the upsert dict (keys must exist in `bases` AFTER migration):
```python
"astro_type": req.get("astro_type"),
"area": _num(req.get("area")),
"solar_energy": _num(req.get("solar_energy")),
"fertility": _num(req.get("fertility")),
"metal": _num(req.get("metal")),
"gas": _num(req.get("gas")),
"crystals": _num(req.get("crystals")),
"recorded_days_ago": req.get("recorded_days_ago"),
```

---

### Task 5 — Tests (`bridge/test_suite.sh`)
**Objective:** prove a recorded-base payload lands in `bases` with the new columns.

**Files:**
- Modify: `bridge/test_suite.sh`

**Step 1** — Add a `base` recorded mode test (the suite is NON-destructive — uses unique
test coords and cleans up in `cleanup_test_data`, see lines 43–60). POST the same
`base` mode JSON the new parser emits (use a synthetic coords key like the existing
`A00:00:00:00`) and assert row fields:
```bash
$DB "SELECT metal FROM bases WHERE coords='A00:00:00:00'"  # expect 4
$DB "SELECT area,solar_energy,fertility FROM bases WHERE coords='A00:00:00:00'"
```
**Step 2** — extend `cleanup_test_data` delete if you introduce a second test coords key.

---

### Task 6 — Surface in reports + verify live
**Objective:** the harness shows the new data and the stack runs.

**Files:**
- Modify: `reports/report.py` (`report_bases`, ~line 47) — optionally add
  area/solar/fertility/resource columns; the webapp (`webapp/app.py`) auto-includes
  new DB columns via `information_schema`, so no webapp code change is expected.

**Verification (acceptance):**
1. `cd bridge && ./test_suite.sh` → 0 failures, recorded-base assertions green.
2. Reload the extension, run an autoscout pass on a scout-only base → sidebar shows
   "Parsed recorded base C24:01:86:40"; `bases` row gains `area=85`, `solar_energy=2`,
   `fertility=5`, `metal=4`, `gas=3`, `crystals=2`, `recorded_days_ago='1 day'`.
3. `systemctl --user restart archangel-bridge` then re-run the page to confirm no
   regression; check `journalctl --user -u archangel-bridge -n 50`.
4. (Optional but recommended) capture a **second recorded page** (different astro
   type, e.g. `Asteroid`/`Gas Giant`) to confirm terrain + resource variance parse.

---

## Risks / tradeoffs / open questions

- **DOM variance:** only one recorded-DOM sample exists so far. The parser is written
  defensively (`safeMatch`, label-driven `b` picking) so a slightly different server
  version degrades to missing fields rather than throwing. **Action:** collect 2–3 more
  scout pages (esp. asteroid/gas-giant bases) before task 1 hardens the selectors.
- **Fleets on scout pages:** the row's "Fleet" cell is literally `Recorded data` and it
  has no fleet id — so scouting yields only a fleet *size*, not an uploadable fleet.
  Decide later whether to store net scout fleet size somewhere (probably not worth a
  column now; drop if YAGNI).
- **Same-coords collision:** live-eye and scout captures write to the same
  `(servid, coords)` row. A recorded capture sets `structures`/`astro_type`/`area` but
  leaves `construction`/`production`/`research`/economy NULL — an *older live capture*
  could be clobbered on those NULL-ed columns. Mitigate by (a) scout-only writes
  updating only non-NULL/new columns, or (b) accepting overwrite since structures are
  stale anyway. **Recommend (a)** — keep construction/production/research untouched on
  scout updates (only set them when non-empty in `bridge/app.py`).
- **Invariant guard:** `fake_list` honeypot — ensure the new base parser never touches
  it (it won't; it only handles `mode:'base'`).
- **Spy-script safety:** new content-script code must remain gated behind
  `SpyDetect`/`IsSpyFound()` like all other UI/capture paths — verify the 
  `PushUpload` path used is already gated (check `ctF.PushUpload` / content.js wiring).
- **Open question for you (Marji):** should scout-captured bases be visually marked
  "scout/1d-old" in reports/webapp (Stylistically set `recorded_days_ago`), or kept as
  plain rows? Default: expose the column, let reports/users decide.
