#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PID_FILE="${ROOT_DIR}/server.pid"
PORT="${PORT:-3000}"

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    echo "[✓] Country Battle Arena is RUNNING (PID: ${PID})."
    echo "    Health Check: curl http://127.0.0.1:${PORT}"
    if curl -s -I "http://127.0.0.1:${PORT}" | grep -q "200 OK"; then
      echo "    HTTP Status: 200 OK (Healthy)"
    else
      echo "    HTTP Status: Unresponsive"
    fi
    exit 0
  else
    echo "[!] PID file exists (${PID}), but process is DEAD."
    exit 1
  fi
else
  echo "[-] Country Battle Arena is STOPPED."
  exit 0
fi
