#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PID_FILE="${ROOT_DIR}/server.pid"
LOG_FILE="${ROOT_DIR}/logs/server.log"
PORT="${PORT:-3000}"

export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"

# Prevent multiple application instances
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "[!] Country Battle Arena is already running with PID ${OLD_PID} on port ${PORT}."
    exit 0
  else
    rm -f "$PID_FILE"
  fi
fi

# Build if dist does not exist
if [ ! -d "${ROOT_DIR}/dist" ]; then
  echo "[*] Production build missing. Building project..."
  (cd "$ROOT_DIR" && npm run build)
fi

echo "[*] Starting Country Battle Arena 24/7 Server on port ${PORT}..."
nohup node "${ROOT_DIR}/scripts/server.mjs" >> "$LOG_FILE" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"

sleep 1
if kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "[✓] Server successfully started (PID: ${SERVER_PID})."
  echo "    URL: http://127.0.0.1:${PORT}"
  echo "    Broadcast View: http://127.0.0.1:${PORT}?broadcast=true"
  echo "    Logs: ${LOG_FILE}"
else
  echo "[✗] Failed to start server. Check ${LOG_FILE} for details."
  rm -f "$PID_FILE"
  exit 1
fi
