#!/usr/bin/env bash
# Start the archangel web reports UI in the foreground (systemd Type=simple).
# Reuses bridge/.env for DB creds and the bridge venv (has fastapi/uvicorn/pymysql).
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"

load_env() {
  local env_file="../bridge/.env"
  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1091
    . "$env_file"
    set +a
  fi
}

wait_for_mysql() {
  local host="${ARCHANGEL_DB_HOST:-127.0.0.1}"
  local port="${ARCHANGEL_DB_PORT:-3306}"
  local user="${ARCHANGEL_DB_USER:-}"
  local password="${ARCHANGEL_DB_PASSWORD:-}"
  local timeout="${DB_WAIT_TIMEOUT:-60}"
  local elapsed=0

  [[ -n "$user" && -n "$password" ]] || return 0

  echo "Waiting for MariaDB at ${host}:${port} (up to ${timeout}s)..."
  while ! MYSQL_PWD="$password" mysqladmin --protocol=tcp -h "$host" -P "$port" -u "$user" ping --silent >/dev/null 2>&1; do
    if (( elapsed >= timeout )); then
      echo "MariaDB not reachable at ${host}:${port} after ${timeout}s" >&2
      return 1
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  echo "MariaDB is up at ${host}:${port} (waited ${elapsed}s)."
}

load_env
wait_for_mysql

# Bind all interfaces so the UI is reachable on the LAN. Port 8020.
WEBAPP_BIND="${WEBAPP_BIND:-0.0.0.0}"
WEBAPP_PORT="${WEBAPP_PORT:-8020}"

exec ../bridge/.venv/bin/uvicorn app:app --host "$WEBAPP_BIND" --port "$WEBAPP_PORT" --app-dir "$(pwd)"
