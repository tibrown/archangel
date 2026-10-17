/* Archangel web reports — single-page UI. */
"use strict";

const $ = (id) => document.getElementById(id);

const NUMERIC = new Set(["tinyint","smallint","mediumint","int","bigint","decimal","float","double"]);
const TEXT = new Set(["char","varchar","text","tinytext","mediumtext","longtext"]);
const TIME = new Set(["timestamp","datetime","date","time"]);
const BLOB = new Set(["json","longtext","text","mediumtext","tinytext"]);

const OP_LABELS = {
  eq: "=", neq: "≠", contains: "contains", starts: "starts with", ends: "ends with",
  gt: ">", gte: "≥", lt: "<", lte: "≤", between: "between", in: "in",
  is_null: "is null", is_not_null: "is not null",
};

const OPS_BY_KIND = {
  number: ["eq","neq","gt","gte","lt","lte","between","in","is_null","is_not_null"],
  text:   ["contains","eq","neq","starts","ends","in","is_null","is_not_null"],
  bool:   ["eq","is_null","is_not_null"],
  time:   ["eq","gt","gte","lt","lte","between","is_null","is_not_null"],
  json:   ["contains","is_null","is_not_null"],
};

const state = {
  tables: [],
  table: null,          // current table meta
  columns: [],          // visible columns
  filters: [],          // [{field, op, value, value2}]
  q: "",
  server: "",
  sort: { field: "", dir: "asc" },
  page: 0,
  limit: 100,
  total: 0,
  expanded: new Set(),   // fleet_ids currently expanded (fleets table)
  fleetDetails: {},      // fleet_id -> details array (cached)
  expandedGuilds: new Set(),  // "servid:guild_id" currently expanded (guilds table)
  guildMembers: {},      // "servid:guild_id" -> member rows (cached)
  expandedMembers: new Set(), // "servid:guild_id:player_id" expanded
  playerProfiles: {},    // "servid:player_id" -> profile rows (cached)
  expandedSystems: new Set(), // "servid:system" currently expanded (systems table)
  systemAstros: {},      // "servid:system" -> astro rows (cached)
};

// Detail tables that are only reachable via drill-down from a parent table,
// so they are hidden from the sidebar list.
const HIDDEN_TABLES = new Set(["fleet_details", "guild_members", "system_astros"]);

function kindOf(col) {
  const t = col.type;
  if (BLOB.has(t)) return "json";
  if (NUMERIC.has(t)) return "number";
  if (TIME.has(t)) return "time";
  if (TEXT.has(t)) return "text";
  return "text";
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;",
  }[c]));
}

/* ---------------- init ---------------- */
async function init() {
  bindEvents();
  await refreshAll();
}

// Re-query the database: refresh the sidebar table totals (and server list),
// then reload the currently-selected table's rows. Called on load and by the
// Refresh button so the sidebar counts stay current without a full F5.
async function refreshAll() {
  const [tables, servers] = await Promise.all([
    fetch("/api/tables").then((r) => r.json()),
    fetch("/api/servers").then((r) => r.json()),
  ]);
  state.tables = tables.filter((t) => !HIDDEN_TABLES.has(t.name));
  renderTableList();
  renderServerFilter(servers);
  if (state.table) {
    // keep the selected table's meta fresh (row_count etc.)
    const t = tables.find((x) => x.name === state.table.name);
    if (t) state.table = t;
    loadRows();
  } else if (tables.length) {
    selectTable(tables[0].name);
  }
}

function renderTableList() {
  const nav = $("table-list");
  nav.innerHTML = "";
  for (const t of state.tables) {
    const el = document.createElement("div");
    el.className = "tbl-item" + (t.name === state.table?.name ? " active" : "");
    el.dataset.name = t.name;
    el.innerHTML = `<span>${esc(t.name)}</span><span class="cnt">${t.row_count}</span>`;
    el.addEventListener("click", () => selectTable(t.name));
    nav.appendChild(el);
  }
}

function renderServerFilter(servers) {
  const sel = $("server-filter");
  sel.innerHTML = '<option value="">All servers</option>';
  for (const s of servers) {
    const o = document.createElement("option");
    o.value = s.servid;
    o.textContent = s.server_name;
    sel.appendChild(o);
  }
}

function bindEvents() {
  $("table-search").addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase();
    for (const el of $("table-list").children) {
      el.style.display = el.dataset.name.includes(q) ? "" : "none";
    }
  });
  $("global-search").addEventListener("input", debounce((e) => {
    state.q = e.target.value.trim();
    state.page = 0;
    loadRows();
  }, 250));
  $("server-filter").addEventListener("change", (e) => {
    state.server = e.target.value;
    state.page = 0;
    loadRows();
  });
  $("btn-add-filter").addEventListener("click", () => {
    state.filters.push({ field: firstFilterable(), op: "contains", value: "" });
    renderFilterBar();
  });
  $("btn-export").addEventListener("click", exportCsv);
  $("btn-refresh").addEventListener("click", refreshAll);
  $("btn-expand-all").addEventListener("click", expandAllFleets);
  $("btn-collapse-all").addEventListener("click", collapseAllFleets);
  $("btn-cols").addEventListener("click", (e) => {
    e.stopPropagation();
    $("cols-menu").classList.toggle("hidden");
  });
  document.addEventListener("click", (e) => {
    if (!$("cols-menu").contains(e.target)) $("cols-menu").classList.add("hidden");
  });
  $("pg-prev").addEventListener("click", () => { if (state.page > 0) { state.page--; loadRows(); } });
  $("pg-next").addEventListener("click", () => {
    if ((state.page + 1) * state.limit < state.total) { state.page++; loadRows(); }
  });
  $("modal-close").addEventListener("click", closeModal);
  $("modal").addEventListener("click", (e) => { if (e.target === $("modal")) closeModal(); });
}

function firstFilterable() {
  const text = state.table.columns.find((c) => kindOf(c) === "text");
  if (text) return text.name;
  const c = state.table.columns.find((c) => kindOf(c) !== "json");
  return c ? c.name : state.table.columns[0].name;
}

/* ---------------- table selection ---------------- */
function selectTable(name) {
  const t = state.tables.find((x) => x.name === name);
  if (!t) return;
  state.table = t;
  state.columns = t.columns.filter((c) => !c.default_hidden).map((c) => c.name);
  state.filters = [];
  state.q = "";
  state.server = "";
  state.sort = { field: "", dir: "asc" };
  state.page = 0;
  $("global-search").value = "";
  $("server-filter").value = "";
  $("table-title").textContent = t.name;
  $("btn-export").disabled = false;
  $("btn-cols").disabled = false;
  state.expanded = new Set();
  state.fleetDetails = {};
  state.expandedGuilds = new Set();
  state.guildMembers = {};
  state.expandedMembers = new Set();
  state.playerProfiles = {};
  state.expandedSystems = new Set();
  state.systemAstros = {};
  $("fleet-expand").classList.toggle("hidden", !isFleetsTable());
  renderTableList();
  renderFilterBar();
  renderColumnsMenu();
  loadRows();
}

/* ---------------- filter bar ---------------- */
function renderFilterBar() {
  const bar = $("filter-bar");
  bar.innerHTML = "";
  for (let i = 0; i < state.filters.length; i++) {
    bar.appendChild(buildFilterChip(i));
  }
}

function buildFilterChip(i) {
  const f = state.filters[i];
  const chip = document.createElement("div");
  chip.className = "filter-chip";

  const fieldSel = document.createElement("select");
  for (const c of state.table.columns) {
    const o = document.createElement("option");
    o.value = c.name;
    o.textContent = c.name;
    if (c.name === f.field) o.selected = true;
    fieldSel.appendChild(o);
  }
  fieldSel.addEventListener("change", () => {
    f.field = fieldSel.value;
    f.op = defaultOp(f.field);
    f.value = "";
    f.value2 = "";
    renderFilterBar();
    loadRows();
  });

  const opSel = document.createElement("select");
  opSel.className = "f-op";
  const ops = OPS_BY_KIND[kindOf(colByName(f.field))] || OPS_BY_KIND.text;
  for (const op of ops) {
    const o = document.createElement("option");
    o.value = op;
    o.textContent = OP_LABELS[op];
    if (op === f.op) o.selected = true;
    opSel.appendChild(o);
  }
  opSel.addEventListener("change", () => {
    f.op = opSel.value;
    f.value = "";
    f.value2 = "";
    renderFilterBar();
    loadRows();
  });

  const needsVal = !["is_null", "is_not_null"].includes(f.op);
  const valWrap = document.createElement("span");
  if (needsVal) {
    if (f.op === "between") {
      const a = mkValInput(f, "value", "min");
      const b = mkValInput(f, "value2", "max");
      valWrap.append(a, document.createTextNode(" and "), b);
    } else {
      const ph = f.op === "in" ? "a,b,c" : "value";
      valWrap.appendChild(mkValInput(f, "value", ph));
    }
  }

  const rm = document.createElement("button");
  rm.className = "f-rm";
  rm.textContent = "✕";
  rm.title = "Remove filter";
  rm.addEventListener("click", () => {
    state.filters.splice(i, 1);
    renderFilterBar();
    loadRows();
  });

  chip.append(fieldSel, opSel, valWrap, rm);
  return chip;
}

function mkValInput(f, key, ph) {
  const inp = document.createElement("input");
  inp.placeholder = ph;
  inp.value = f[key] ?? "";
  inp.addEventListener("input", debounce(() => {
    f[key] = inp.value;
    loadRows();
  }, 300));
  return inp;
}

function colByName(name) {
  return state.table.columns.find((c) => c.name === name);
}

function defaultOp(field) {
  const k = kindOf(colByName(field));
  return k === "number" ? "eq" : k === "json" ? "contains" : "contains";
}

/* ---------------- columns menu ---------------- */
function renderColumnsMenu() {
  const menu = $("cols-menu");
  menu.innerHTML = "";
  for (const c of state.table.columns) {
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = state.columns.includes(c.name);
    cb.addEventListener("change", () => {
      if (cb.checked) state.columns.push(c.name);
      else state.columns = state.columns.filter((n) => n !== c.name);
      renderGridHead();
      renderGridBody();
    });
    label.append(cb, document.createTextNode(c.name));
    menu.appendChild(label);
  }
}

/* ---------------- data loading ---------------- */
function buildQuery() {
  const p = new URLSearchParams();
  p.set("limit", state.limit);
  p.set("offset", state.page * state.limit);
  if (state.q) p.set("q", state.q);
  if (state.server) p.set("server", state.server);
  if (state.sort.field) { p.set("sort", state.sort.field); p.set("order", state.sort.dir); }
  for (const f of state.filters) {
    if (!f.field || !f.op) continue;
    const out = { field: f.field, op: f.op };
    if (f.op === "in") {
      out.value = (f.value || "").split(",").map((s) => s.trim()).filter(Boolean);
    } else if (f.op === "between") {
      out.value = f.value; out.value2 = f.value2;
    } else if (!["is_null", "is_not_null"].includes(f.op)) {
      out.value = f.value;
    }
    p.append("filters", JSON.stringify(out));
  }
  return p;
}

async function loadRows() {
  if (!state.table) return;
  const res = await fetch(`/api/tables/${state.table.name}/rows?` + buildQuery());
  if (!res.ok) { showError(await res.text()); return; }
  const data = await res.json();
    state.total = data.total;
    state._rows = data.rows;
    renderGridHead();
  renderGridBody();
  renderPager();
}

function renderGridHead() {
  const head = $("grid-head");
  head.innerHTML = "";
  const tr = document.createElement("tr");
  for (const name of state.columns) {
    const th = document.createElement("th");
    th.textContent = name;
    if (state.sort.field === name) {
      const arrow = document.createElement("span");
      arrow.className = "arrow";
      arrow.textContent = state.sort.dir === "asc" ? " ▲" : " ▼";
      th.appendChild(arrow);
    }
    th.addEventListener("click", () => {
      if (state.sort.field === name) {
        state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
      } else {
        state.sort = { field: name, dir: "asc" };
      }
      state.page = 0;
      loadRows();
    });
    tr.appendChild(th);
  }
  head.appendChild(tr);
}

function renderGridBody() {
  const body = $("grid-body");
  body.innerHTML = "";
  const rows = state._rows || [];
  if (!rows.length) {
    $("empty").classList.remove("hidden");
    return;
  }
  $("empty").classList.add("hidden");
  const isFleets = isFleetsTable();
  const isGuilds = isGuildsTable();
  const isSystems = isSystemsTable();
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const name of state.columns) {
      tr.appendChild(cellFor(name, row[name]));
    }
    if (isSystems) {
      const sKey = systemKey(row);
      tr.classList.add("system-row");
      tr.dataset.sKey = sKey;
      tr.title = "Click to expand astros";
      tr.addEventListener("click", () => toggleSystem(row, tr));
      body.appendChild(tr);
      if (state.expandedSystems.has(sKey)) {
        tr.classList.add("expanded");
        insertSystemAstros(sKey, tr); // async; renders when loaded
      }
    } else if (isGuilds) {
      const gKey = guildKey(row);
      tr.classList.add("guild-row");
      tr.dataset.gKey = gKey;
      tr.title = "Click to expand members";
      tr.addEventListener("click", () => toggleGuild(row, tr));
      body.appendChild(tr);
      if (state.expandedGuilds.has(gKey)) {
        tr.classList.add("expanded");
        insertGuildMembers(gKey, tr); // async; renders when loaded
      }
    } else if (isFleets) {
      tr.classList.add("fleet-row");
      tr.dataset.fleetId = row.fleet_id;
      tr.title = "Click to expand fleet details";
      tr.addEventListener("click", () => toggleFleet(row.fleet_id, tr));
      body.appendChild(tr);
      if (state.expanded.has(String(row.fleet_id))) {
        tr.classList.add("expanded");
        insertFleetDetail(row.fleet_id, tr); // async; renders when loaded
      }
    } else {
      body.appendChild(tr);
    }
  }
}

function cellFor(name, v) {
  const td = document.createElement("td");
  const c = colByName(name);
  const k = kindOf(c);
  if (v === null || v === undefined) {
    td.className = "null";
    td.textContent = "—";
    return td;
  }
  if (k === "json") {
    td.className = "json";
    const s = typeof v === "string" ? v : JSON.stringify(v);
    td.textContent = s.length > 120 ? s.slice(0, 120) + "…" : s;
    td.title = "Click to expand";
    td.addEventListener("click", () => openModal(`${name}`, v));
    return td;
  }
  if (k === "number") {
    td.className = "num";
    td.textContent = v;
    return td;
  }
  td.textContent = v;
  return td;
}

function isFleetsTable() {
  return state.table && state.table.name === "fleets";
}

async function fetchFleetDetails(fleetId) {
  const key = String(fleetId);
  if (state.fleetDetails[key]) return state.fleetDetails[key];
  const p = new URLSearchParams();
  p.set("limit", 100);
  p.append("filters", JSON.stringify({ field: "fleet_id", op: "eq", value: key }));
  const res = await fetch(`/api/tables/fleet_details/rows?` + p);
  if (!res.ok) return [];
  const data = await res.json();
  const details = data.rows.length ? data.rows[0].details : [];
  state.fleetDetails[key] = details;
  return details;
}

function renderFleetDetailRow(fleetId, details) {
  const tr = document.createElement("tr");
  tr.className = "fleet-detail-row";
  const td = document.createElement("td");
  td.colSpan = state.columns.length;
  let html = '<table class="fleet-detail-grid"><thead><tr><th>Unit</th><th>Amount</th></tr></thead><tbody>';
  if (details && details.length) {
    for (const d of details) {
      html += `<tr><td>${esc(d.unit)}</td><td>${esc(d.amt)}</td></tr>`;
    }
  } else {
    html += '<tr><td colspan="2" class="muted">No fleet details captured.</td></tr>';
  }
  html += '</tbody></table>';
  td.innerHTML = html;
  tr.appendChild(td);
  return tr;
}

async function insertFleetDetail(fleetId, tr) {
  const details = await fetchFleetDetails(fleetId);
  const next = tr.nextSibling;
  if (next && next.classList && next.classList.contains("fleet-detail-row")) next.remove();
  tr.after(renderFleetDetailRow(fleetId, details));
}

async function toggleFleet(fleetId, tr) {
  const key = String(fleetId);
  if (state.expanded.has(key)) {
    state.expanded.delete(key);
    tr.classList.remove("expanded");
    const next = tr.nextSibling;
    if (next && next.classList && next.classList.contains("fleet-detail-row")) next.remove();
    return;
  }
  state.expanded.add(key);
  tr.classList.add("expanded");
  await insertFleetDetail(fleetId, tr);
}

async function expandAllFleets() {
  const rows = document.querySelectorAll("#grid-body tr.fleet-row");
  for (const tr of rows) {
    const fleetId = tr.dataset.fleetId;
    if (fleetId && !state.expanded.has(String(fleetId))) {
      state.expanded.add(String(fleetId));
      tr.classList.add("expanded");
      await insertFleetDetail(fleetId, tr);
    }
  }
}

function collapseAllFleets() {
  state.expanded.clear();
  document.querySelectorAll("#grid-body tr.fleet-detail-row").forEach((r) => r.remove());
  document.querySelectorAll("#grid-body tr.fleet-row").forEach((r) => r.classList.remove("expanded"));
}

/* ---------------- guilds drill-down ---------------- */
function isGuildsTable() {
  return state.table && state.table.name === "guilds";
}

// A guild is identified by (servid, guild_id).
function guildKey(row) {
  return `${row.servid}:${row.guild_id}`;
}

async function fetchGuildMembers(gKey) {
  if (state.guildMembers[gKey] !== undefined) return state.guildMembers[gKey];
  const [servid, guildId] = gKey.split(":");
  const p = new URLSearchParams();
  p.set("limit", 500);
  p.append("filters", JSON.stringify({ field: "guild_id", op: "eq", value: guildId }));
  p.set("server", servid);
  const res = await fetch(`/api/tables/guild_members/rows?` + p);
  if (!res.ok) return [];
  const data = await res.json();
  state.guildMembers[gKey] = data.rows;
  return data.rows;
}

async function fetchPlayerProfile(pKey) {
  if (state.playerProfiles[pKey] !== undefined) return state.playerProfiles[pKey];
  const [servid, playerId] = pKey.split(":");
  const p = new URLSearchParams();
  p.set("limit", 1);
  p.append("filters", JSON.stringify({ field: "player_id", op: "eq", value: playerId }));
  p.set("server", servid);
  const res = await fetch(`/api/tables/profiles/rows?` + p);
  if (!res.ok) return [];
  const data = await res.json();
  state.playerProfiles[pKey] = data.rows;
  return data.rows;
}

function renderGuildMembersDetail(gKey, members) {
  const tr = document.createElement("tr");
  tr.className = "guild-detail-row";
  const td = document.createElement("td");
  td.colSpan = state.columns.length;
  const wrap = document.createElement("div");
  wrap.className = "guild-members";
  const info = document.createElement("div");
  info.className = "sub-title";
  info.textContent = `${members.length} member(s) — click a member for profile details`;
  wrap.appendChild(info);

  const table = document.createElement("table");
  table.className = "guild-members-grid";
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>Nick</th><th>Level</th><th>Player ID</th></tr>";
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  for (const m of members) {
    const mKey = `${m.servid}:${m.player_id}`;
    const mtr = document.createElement("tr");
    mtr.className = "gm-member-row";
    mtr.dataset.mKey = mKey;
    mtr.dataset.expanded = state.expandedMembers.has(mKey) ? "1" : "0";
    mtr.innerHTML = `<td>${esc(m.nick)}</td><td>${esc(m.level)}</td><td>${esc(m.player_id)}</td>`;
    mtr.title = "Click to expand profile";
    mtr.addEventListener("click", () => toggleMemberProfile(mKey, mtr));
    tbody.appendChild(mtr);
    if (state.expandedMembers.has(mKey)) {
      mtr.classList.add("expanded");
    }
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  td.appendChild(wrap);
  tr.appendChild(td);
  return tr;
}

function renderPlayerProfileDetail(mKey, profiles) {
  const tr = document.createElement("tr");
  tr.className = "gm-profile-row";
  const td = document.createElement("td");
  td.colSpan = 3;
  if (!profiles.length) {
    td.innerHTML = '<div class="muted">No profile captured for this player yet.</div>';
    tr.appendChild(td);
    return tr;
  }
  const p = profiles[0];
  const wrap = document.createElement("div");
  wrap.className = "player-profile";
  const grid = document.createElement("div");
  grid.className = "player-profile-grid";
  const pairs = [
    ["Player", p.player_name],
    ["Level", p.level],
    ["Guild", p.guild_name || (p.guild_tag ? `[${p.guild_tag}]` : "")],
    ["Inactive (days)", p.inactive_days],
    ["Days in vacation", p.days_in_vac],
  ];
  for (const [k, v] of pairs) {
    const key = document.createElement("div");
    key.className = "pp-key";
    key.textContent = k;
    const val = document.createElement("div");
    val.className = "pp-val";
    val.textContent = v == null || v === "" ? "—" : v;
    grid.append(key, val);
  }
  wrap.appendChild(grid);
  td.appendChild(wrap);
  tr.appendChild(td);
  return tr;
}

async function insertGuildMembers(gKey, guildTr) {
  const members = await fetchGuildMembers(gKey);
  const next = guildTr.nextSibling;
  if (next && next.classList && next.classList.contains("guild-detail-row")) next.remove();
  const detail = renderGuildMembersDetail(gKey, members);
  guildTr.after(detail);
  // render any already-expanded member profiles below their member rows
  for (const mtr of detail.querySelectorAll("tr.gm-member-row")) {
    if (mtr.dataset.expanded === "1") {
      insertPlayerProfile(mtr.dataset.mKey, mtr);
    }
  }
}

async function insertPlayerProfile(mKey, memberTr) {
  const profiles = await fetchPlayerProfile(mKey);
  const next = memberTr.nextSibling;
  if (next && next.classList && next.classList.contains("gm-profile-row")) next.remove();
  memberTr.after(renderPlayerProfileDetail(mKey, profiles));
}

async function toggleGuild(row, tr) {
  const gKey = guildKey(row);
  if (state.expandedGuilds.has(gKey)) {
    state.expandedGuilds.delete(gKey);
    tr.classList.remove("expanded");
    const next = tr.nextSibling;
    if (next && next.classList && next.classList.contains("guild-detail-row")) next.remove();
    return;
  }
  state.expandedGuilds.add(gKey);
  tr.classList.add("expanded");
  await insertGuildMembers(gKey, tr);
}

async function toggleMemberProfile(mKey, memberTr) {
  if (state.expandedMembers.has(mKey)) {
    state.expandedMembers.delete(mKey);
    memberTr.classList.remove("expanded");
    const next = memberTr.nextSibling;
    if (next && next.classList && next.classList.contains("gm-profile-row")) next.remove();
    return;
  }
  state.expandedMembers.add(mKey);
  memberTr.classList.add("expanded");
  await insertPlayerProfile(mKey, memberTr);
}

/* ---------------- systems drill-down ---------------- */
function isSystemsTable() {
  return state.table && state.table.name === "systems";
}

// A system is identified by (servid, system).
function systemKey(row) {
  // system coords contain colons (C24:22:99), so use | as the separator
  return `${row.servid}|${row.system}`;
}

async function fetchSystemAstros(sKey) {
  if (state.systemAstros[sKey] !== undefined) return state.systemAstros[sKey];
  const [servid, system] = sKey.split("|");
  const p = new URLSearchParams();
  p.set("limit", 500);
  p.append("filters", JSON.stringify({ field: "system", op: "eq", value: system }));
  p.set("server", servid);
  const res = await fetch(`/api/tables/system_astros/rows?` + p);
  if (!res.ok) return [];
  const data = await res.json();
  state.systemAstros[sKey] = data.rows;
  return data.rows;
}

function renderSystemAstrosDetail(sKey, astros) {
  const tr = document.createElement("tr");
  tr.className = "system-detail-row";
  const td = document.createElement("td");
  td.colSpan = state.columns.length;
  const wrap = document.createElement("div");
  wrap.className = "system-astros";
  const info = document.createElement("div");
  info.className = "sub-title";
  info.textContent = `${astros.length} astro(s)`;
  wrap.appendChild(info);

  const table = document.createElement("table");
  table.className = "system-astros-grid";
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>Coord</th><th>Terrain</th><th>Empty</th><th>Base</th><th>Player</th><th>Wormhole</th><th>Occ</th><th>Debris</th></tr>";
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  for (const a of astros) {
    const atr = document.createElement("tr");
    atr.innerHTML =
      `<td>${esc(a.coord)}</td>` +
      `<td>${esc(a.terrain)}</td>` +
      `<td>${a.empty ? "yes" : ""}</td>` +
      `<td>${esc(a.base_id)}</td>` +
      `<td>${esc(a.player_id)}</td>` +
      `<td>${a.wormhole ? "yes" : ""}</td>` +
      `<td>${esc(a.occ_player_id)}</td>` +
      `<td>${esc(a.debris)}</td>`;
    tbody.appendChild(atr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  td.appendChild(wrap);
  tr.appendChild(td);
  return tr;
}

async function insertSystemAstros(sKey, systemTr) {
  const astros = await fetchSystemAstros(sKey);
  const next = systemTr.nextSibling;
  if (next && next.classList && next.classList.contains("system-detail-row")) next.remove();
  systemTr.after(renderSystemAstrosDetail(sKey, astros));
}

async function toggleSystem(row, tr) {
  const sKey = systemKey(row);
  if (state.expandedSystems.has(sKey)) {
    state.expandedSystems.delete(sKey);
    tr.classList.remove("expanded");
    const next = tr.nextSibling;
    if (next && next.classList && next.classList.contains("system-detail-row")) next.remove();
    return;
  }
  state.expandedSystems.add(sKey);
  tr.classList.add("expanded");
  await insertSystemAstros(sKey, tr);
}

function renderPager() {
  const start = state.total ? state.page * state.limit + 1 : 0;
  const end = Math.min((state.page + 1) * state.limit, state.total);
  $("pg-info").textContent = `${start}–${end} of ${state.total}`;
  $("pg-prev").disabled = state.page === 0;
  $("pg-next").disabled = (state.page + 1) * state.limit >= state.total;
  $("result-count").textContent = `${state.total} rows`;
}

/* ---------------- export / modal ---------------- */
function exportCsv() {
  const p = buildQuery();
  p.delete("limit"); p.delete("offset");
  window.location = `/api/tables/${state.table.name}/export.csv?` + p;
}

function openModal(title, value) {
  $("modal-title").textContent = title;
  $("modal-body").textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  $("modal").classList.remove("hidden");
}
function closeModal() { $("modal").classList.add("hidden"); }

function showError(msg) {
  $("empty").classList.remove("hidden");
  $("empty").textContent = "Error: " + msg;
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

init();
