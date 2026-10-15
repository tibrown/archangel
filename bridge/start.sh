#!/usr/bin/env bash
# Start the archangel bridge in the foreground (systemd Type=simple).
# Waits for MariaDB to accept connections first — the user manager can race
# the system mariadb.service at boot.
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"

load_env() {
  if [[ -f .env ]]; then
    set -a
    # shellcheck disable=SC1091
    . ./.env
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

# The browser runs on a different machine than the bridge, so bind all
# interfaces. Port 8010 — 8000 is taken by another app on this host.
BRIDGE_BIND="${BRIDGE_BIND:-0.0.0.0}"
BRIDGE_PORT="${BRIDGE_PORT:-8010}"

exec .venv/bin/uvicorn app:app --host "$BRIDGE_BIND" --port "$BRIDGE_PORT"
