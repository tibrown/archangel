"""Archangel web reports UI — read-only FastAPI backend.

Serves a single-page UI (static/) that runs reports over every table in the
archangel MariaDB with robust per-column filtering, global search, sorting,
pagination, and CSV export.

Read-only by construction: only SELECT statements are ever issued, table and
column names are validated against information_schema before any SQL
interpolation, and all user-supplied values are bound as %s parameters.

Reuses bridge/db.py (auto-reads bridge/.env for credentials) and the bridge
venv, exactly like reports/report.py does.
"""
import csv
import io
import json
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

# Allow `import db` from bridge/ (one directory up).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "bridge"))

import db  # noqa: E402

app = FastAPI(title="Archangel web reports")

STATIC_DIR = Path(__file__).resolve().parent / "static"

# ---------------------------------------------------------------------------
# schema introspection (cached per process)
# ---------------------------------------------------------------------------
def _load_schema():
    """Return {table: {columns: [{name, type, nullable, pk}], row_count}}."""
    tables = {}
    for t in db.query(
        "SELECT table_name FROM information_schema.TABLES "
        "WHERE table_schema=%s ORDER BY table_name",
        (db.DB_NAME,),
    ):
        tables[t["table_name"]] = {"columns": [], "row_count": 0}

    for c in db.query(
        "SELECT table_name, column_name, data_type, column_type, is_nullable, "
        "column_key FROM information_schema.COLUMNS "
        "WHERE table_schema=%s ORDER BY table_name, ordinal_position",
        (db.DB_NAME,),
    ):
        t = tables.get(c["table_name"])
        if t is None:
            continue
        t["columns"].append(
            {
                "name": c["column_name"],
                "type": c["data_type"],
                "column_type": c["column_type"],
                "nullable": c["is_nullable"] == "YES",
                "pk": c["column_key"] == "PRI",
            }
        )

    # Real row counts (cheap enough for this dataset; all tables are small).
    for name in tables:
        try:
            tables[name]["row_count"] = db.query_one(
                f"SELECT COUNT(*) c FROM `{name}`"
            )["c"]
        except Exception:
            tables[name]["row_count"] = -1
    return tables


SCHEMA = _load_schema()

# JSON / text blob columns that should be rendered as expandable detail, not
# dumped raw into the grid.
BLOB_TYPES = {"json", "longtext", "text", "mediumtext", "tinytext"}
NUMERIC_TYPES = {"tinyint", "smallint", "mediumint", "int", "bigint", "decimal", "float", "double"}
TEXT_TYPES = {"char", "varchar", "text", "tinytext", "mediumtext", "longtext"}

OPS = {
    "eq": "=",
    "neq": "<>",
    "contains": "LIKE",
    "starts": "LIKE",
    "ends": "LIKE",
    "gt": ">",
    "gte": ">=",
    "lt": "<",
    "lte": "<=",
    "between": "BETWEEN",
    "in": "IN",
    "is_null": "IS NULL",
    "is_not_null": "IS NOT NULL",
}


def _has_servid(table):
    """True if the table carries a servid FK (so it joins to servers)."""
    return table != "servers" and any(c["name"] == "servid" for c in SCHEMA[table]["columns"])


def _col_expr(table, col):
    """Resolve a (possibly virtual 'server') column to (sql_expr, ctype).

    The virtual `server` column maps to the joined server name; everything
    else must be a real column on the table. Raises 400 on an unknown column
    so user-supplied identifiers are never interpolated unchecked.
    """
    if col == "server" and _has_servid(table):
        return "s.server_name", "varchar"
    for c in SCHEMA[table]["columns"]:
        if c["name"] == col:
            return f"t.`{col}`", c["type"]
    raise HTTPException(400, f"Unknown column '{col}' on table '{table}'")


def _validate_table(table):
    if table not in SCHEMA:
        raise HTTPException(404, f"Unknown table '{table}'")
    return SCHEMA[table]


def _server_join(table):
    """Return (join_sql, select_sql) adding the server name as `server`."""
    return (
        "LEFT JOIN servers s ON s.servid = t.servid",
        "s.server_name AS server",
    )


def _build_where(table, filters, q, server):
    """Build (where_sql, args) from validated filters + global search + server."""
    clauses = []
    args = []

    if server:
        clauses.append("t.servid = %s")
        args.append(server)

    for f in filters:
        col = f.get("field")
        op = f.get("op")
        val = f.get("value")
        if not col or op not in OPS:
            continue
        expr, ctype = _col_expr(table, col)  # validates col

        # value-requiring ops with an empty value are no-ops (skip), so a
        # half-typed filter never silently returns 0 rows.
        if op not in ("is_null", "is_not_null"):
            if val is None or (isinstance(val, str) and not val.strip()):
                continue

        if op in ("is_null", "is_not_null"):
            clauses.append(f"{expr} IS {'NULL' if op == 'is_null' else 'NOT NULL'}")
            continue

        if op == "between":
            lo, hi = val, f.get("value2")
            if lo is None or hi is None:
                continue
            clauses.append(f"{expr} BETWEEN %s AND %s")
            args.extend([lo, hi])
            continue

        if op == "in":
            items = val if isinstance(val, list) else [val]
            if not items:
                continue
            placeholders = ", ".join(["%s"] * len(items))
            clauses.append(f"{expr} IN ({placeholders})")
            args.extend(items)
            continue

        if op in ("contains", "starts", "ends"):
            if ctype in NUMERIC_TYPES:
                # numeric columns: treat as equality on the numeric value
                clauses.append(f"{expr} = %s")
                args.append(val)
            else:
                like = f"%{val}%" if op == "contains" else (
                    f"{val}%" if op == "starts" else f"%{val}"
                )
                clauses.append(f"{expr} LIKE %s")
                args.append(like)
        else:
            clauses.append(f"{expr} {OPS[op]} %s")
            args.append(val)

    if q:
        # global search across text columns plus the joined server name
        exprs = [f"t.`{c['name']}`" for c in SCHEMA[table]["columns"] if c["type"] in TEXT_TYPES]
        if _has_servid(table):
            exprs.append("s.server_name")
        if exprs:
            like = f"%{q}%"
            clauses.append("(" + " OR ".join(f"{e} LIKE %s" for e in exprs) + ")")
            args.extend([like] * len(exprs))

    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    return where, args


def _order_sql(table, meta, sort, order):
    """Validate sort and return an ORDER BY clause (handles the server column)."""
    if sort:
        expr, _ = _col_expr(table, sort)
        if order not in ("asc", "desc"):
            order = "asc"
        return f" ORDER BY {expr} {order.upper()}"
    pk = next((c["name"] for c in meta["columns"] if c["pk"]), "id")
    return f" ORDER BY t.`{pk}`"


def _parse_filters(raw):
    """Parse the `filters` query param (repeated) into a list of dicts."""
    out = []
    for f in raw or []:
        try:
            d = json.loads(f)
        except (TypeError, ValueError):
            continue
        if isinstance(d, dict):
            out.append(d)
    return out


def _expand_json(rows, meta):
    """Parse JSON/blob columns into values the grid can render."""
    for r in rows:
        for c in meta["columns"]:
            if c["type"] in BLOB_TYPES and r.get(c["name"]) is not None:
                v = r[c["name"]]
                if isinstance(v, str):
                    try:
                        r[c["name"]] = json.loads(v)
                    except (ValueError, TypeError):
                        pass  # keep as string
    return rows


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------
@app.get("/api/tables")
def list_tables():
    """All tables with row counts and column metadata.

    Tables with a `servid` FK get a virtual `server` column (the joined server
    name) shown first, and the raw `servid` marked default_hidden so the UI
    shows the name rather than the id.

    Row counts are recomputed on every request (not read from the cached
    SCHEMA) so the sidebar totals stay current as the bridge captures data —
    the schema/columns are static, but the counts are not.
    """
    out = []
    for name, meta in SCHEMA.items():
        try:
            row_count = db.query_one(f"SELECT COUNT(*) c FROM `{name}`")["c"]
        except Exception:
            row_count = -1
        cols = meta["columns"]
        if _has_servid(name):
            cols = [dict(c, default_hidden=True) if c["name"] == "servid" else c for c in cols]
            cols.insert(
                0,
                {
                    "name": "server",
                    "type": "varchar",
                    "column_type": "varchar(32)",
                    "nullable": True,
                    "pk": False,
                    "server_name": True,
                },
            )
        out.append({"name": name, "row_count": row_count, "columns": cols})
    return out


@app.get("/api/servers")
def list_servers():
    return db.query("SELECT servid, server_name FROM servers ORDER BY servid")


@app.get("/api/tables/{table}/rows")
def table_rows(
    table: str,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    q: str = Query(""),
    server: int = Query(None),
    sort: str = Query(""),
    order: str = Query("asc"),
    filters: list[str] = Query([]),
):
    """Paginated, filtered, searchable rows for one table."""
    meta = _validate_table(table)
    filters = _parse_filters(filters)

    join_sql, server_select = _server_join(table)
    where, args = _build_where(table, filters, q, server)
    order_sql = _order_sql(table, meta, sort, order)

    count_sql = f"SELECT COUNT(*) c FROM `{table}` t {join_sql}{where}"
    total = db.query_one(count_sql, args)["c"]

    rows_sql = (
        f"SELECT t.*, {server_select} FROM `{table}` t {join_sql}{where}"
        f"{order_sql} LIMIT %s OFFSET %s"
    )
    rows = _expand_json(db.query(rows_sql, args + [limit, offset]), meta)

    return {"total": total, "rows": rows, "limit": limit, "offset": offset}


@app.get("/api/tables/{table}/rows/{row_id}")
def row_detail(table: str, row_id: int):
    """One row by its primary key, with JSON columns expanded."""
    meta = _validate_table(table)
    pk = next((c["name"] for c in meta["columns"] if c["pk"]), "id")
    join_sql, server_select = _server_join(table)
    rows = db.query(
        f"SELECT t.*, {server_select} FROM `{table}` t {join_sql} "
        f"WHERE t.`{pk}` = %s",
        (row_id,),
    )
    if not rows:
        raise HTTPException(404, f"No row {row_id} in {table}")
    return _expand_json(rows, meta)[0]


@app.get("/api/tables/{table}/export.csv")
def export_csv(
    table: str,
    q: str = Query(""),
    server: int = Query(None),
    sort: str = Query(""),
    order: str = Query("asc"),
    filters: list[str] = Query([]),
):
    """CSV export of the current filtered set (capped at 10k rows)."""
    meta = _validate_table(table)
    filters = _parse_filters(filters)
    join_sql, server_select = _server_join(table)
    where, args = _build_where(table, filters, q, server)
    order_sql = _order_sql(table, meta, sort, order)

    rows = db.query(
        f"SELECT t.*, {server_select} FROM `{table}` t {join_sql}{where}"
        f"{order_sql} LIMIT 10000",
        args,
    )

    cols = [c["name"] for c in meta["columns"]]
    if _has_servid(table):
        cols = cols + ["server"]
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(cols)
    for r in rows:
        writer.writerow([r.get(c) for c in cols])
    buf.seek(0)

    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{table}.csv"'},
    )


# ---------------------------------------------------------------------------
# static frontend
# ---------------------------------------------------------------------------
app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
