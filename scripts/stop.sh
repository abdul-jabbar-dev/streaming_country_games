#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PID_FILE="${ROOT_DIR}/server.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "[-] Country Battle Arena is not running (no PID file found)."
  exit 0
fi

PID=$(cat "$PID_FILE")
if kill -0 "$PID" 2>/dev/null; then
  echo "[*] Sending graceful shutdown signal (SIGTERM) to PID ${PID}..."
  kill -15 "$PID"

  # Wait up to 10 seconds for graceful exit
  for i in {1..10}; do
    if ! kill -0 "$PID" 2>/dev/null; then
      break
    fi
    sleep 1
  done

  if kill -0 "$PID" 2>/dev/null; then
    echo "[!] Process did not exit gracefully, sending SIGKILL..."
    kill -9 "$PID"
  fi
  echo "[✓] Stopped Country Battle Arena."
else
  echo "[-] Process ${PID} was not running."
fi

rm -f "$PID_FILE"
