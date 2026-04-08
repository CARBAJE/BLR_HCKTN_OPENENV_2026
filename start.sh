#!/usr/bin/env bash
# start.sh — Launch Vite + FastAPI inside the HF Space container
set -e

echo "=== OpenEnv Boot ==="

# 1. Start the Vite dev server in the background (if package.json exists)
if [ -f "package.json" ]; then
  echo "[1/3] Starting Vite on port 5173..."
  npm run dev -- --host 0.0.0.0 --port 5173 &
  VITE_PID=$!
  echo "      Vite PID: $VITE_PID"
else
  echo "[1/3] No package.json found — skipping Vite."
fi

# 2. Forward HF-required port 7860 → FastAPI on 8000
echo "[2/3] Starting socat: 0.0.0.0:7860 → 127.0.0.1:8000 ..."
socat TCP-LISTEN:7860,fork,reuseaddr TCP:127.0.0.1:8000 &
SOCAT_PID=$!
echo "      socat PID: $SOCAT_PID"

# 3. Start FastAPI (foreground — keeps the container alive)
echo "[3/3] Starting FastAPI on port 8000..."
exec uvicorn server:app \
  --host 0.0.0.0 \
  --port 8000 \
  --workers 1 \
  --log-level info
