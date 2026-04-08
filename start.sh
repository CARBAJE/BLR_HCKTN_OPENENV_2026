#!/usr/bin/env bash
# start.sh — Launch Vite OSaaS + FastAPI inside the HF Space container
# Execution order:
#   1. Vite dev server  (OSaaS frontend, port 5173)
#   2. socat            (forward HF-required port 7860 → FastAPI 8000)
#   3. FastAPI          (server.py, foreground — keeps container alive)
set -e

echo "=== OpenEnv Boot ==="

# 1. Start the Vite dev server (OSaaS is in ./OSaaS subdirectory)
OSASS_DIR="/app/OSaaS"
if [ -f "${OSASS_DIR}/package.json" ]; then
  echo "[1/3] Starting Vite on port 5173 from ${OSASS_DIR}..."
  cd "${OSASS_DIR}" && npx vite --host 0.0.0.0 --port 5173 &
  VITE_PID=$!
  cd /app
  echo "      Vite PID: ${VITE_PID}"
else
  echo "[1/3] No package.json found at ${OSASS_DIR} — skipping Vite."
fi

# 2. Forward HF-required port 7860 → FastAPI on 8000
echo "[2/3] Starting socat: 0.0.0.0:7860 → 127.0.0.1:8000 ..."
socat TCP-LISTEN:7860,fork,reuseaddr TCP:127.0.0.1:8000 &
SOCAT_PID=$!
echo "      socat PID: ${SOCAT_PID}"

# 3. Start FastAPI (foreground — keeps the container alive)
echo "[3/3] Starting FastAPI on port 8000..."
exec uvicorn server:app \
  --host 0.0.0.0 \
  --port 8000 \
  --workers 1 \
  --log-level info
