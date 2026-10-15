"""DB access for the DSIS Archangel local bridge."""
import os
import pymysql
from pathlib import Path


def _load_env_file():
    """Load KEY=VALUE pairs from bridge/.env (next to this file) into os.environ.

    Values already present in the real environment are left untouched, so
    exported env vars win over the file. Hand-rolled to avoid a python-dotenv
    dependency.
    """
    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_env_file()

DB_HOST = os.environ.get("ARCHANGEL_DB_HOST", "127.0.0.1")
DB_PORT = int(os.environ.get("ARCHANGEL_DB_PORT", "3306"))
DB_USER = os.environ.get("ARCHANGEL_DB_USER", "archangel")
DB_PASSWORD = os.environ.get("ARCHANGEL_DB_PASSWORD", "")
DB_NAME = os.environ.get("ARCHANGEL_DB_NAME", "archangel")

if not DB_PASSWORD:
    raise RuntimeError(
        "ARCHANGEL_DB_PASSWORD is not set. Copy bridge/.env.example to "
        "bridge/.env and fill in the real password."
    )


def connect():
    return pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        charset="utf8mb4",
        autocommit=True,
        cursorclass=pymysql.cursors.DictCursor,
    )


def execute(sql, args=None):
    """Run a single statement, return lastrowid."""
    conn = connect()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, args)
            return cur.lastrowid
    finally:
        conn.close()


def query(sql, args=None):
    """Run a SELECT, return list of dict rows."""
    conn = connect()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, args)
            return cur.fetchall()
    finally:
        conn.close()


def query_one(sql, args=None):
    rows = query(sql, args)
    return rows[0] if rows else None


def upsert(table, unique_cols, data):
    """INSERT ... ON DUPLICATE KEY UPDATE for a dict `data`."""
    cols = list(data.keys())
    placeholders = ", ".join(["%s"] * len(cols))
    col_sql = ", ".join(f"`{c}`" for c in cols)
    update_sql = ", ".join(f"`{c}`=VALUES(`{c}`)" for c in cols if c not in unique_cols)
    sql = f"INSERT INTO `{table}` ({col_sql}) VALUES ({placeholders})"
    if update_sql:
        sql += f" ON DUPLICATE KEY UPDATE {update_sql}"
    execute(sql, [data[c] for c in cols])
