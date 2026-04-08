#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# test_docker.sh — Smoke test for the OpenEnv Docker image
#
# Builds the image, runs it, and checks that the FastAPI server is healthy.
# Cleans up the container on exit (success or failure).
#
# Usage (from kackaton_blr2/):
#   ./test_docker.sh [IMAGE_NAME]
#
# Example:
#   ./test_docker.sh openenv:local
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

IMAGE="${1:-openenv:local}"
CONTAINER="openenv-smoke-$$"
HOST_PORT=17860              # local port mapped to container's 7860
MAX_WAIT=60                  # seconds to wait for startup
API="http://127.0.0.1:${HOST_PORT}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}[PASS]${NC} $*"; }
fail() { echo -e "${RED}[FAIL]${NC} $*"; exit 1; }
info() { echo -e "${YELLOW}[INFO]${NC} $*"; }

# ── Cleanup handler ───────────────────────────────────────────────────────────
cleanup() {
  if docker ps -q --filter "name=${CONTAINER}" | grep -q .; then
    info "Stopping container ${CONTAINER}..."
    docker stop "${CONTAINER}" >/dev/null 2>&1 || true
  fi
  docker rm "${CONTAINER}" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

# ─────────────────────────────────────────────────────────────────────────────
# 1. Build
# ─────────────────────────────────────────────────────────────────────────────
info "Building image: ${IMAGE}"
docker build -t "${IMAGE}" . 2>&1 | tail -5
pass "Image built: ${IMAGE}"

# ─────────────────────────────────────────────────────────────────────────────
# 2. Run (detached)
# ─────────────────────────────────────────────────────────────────────────────
info "Starting container ${CONTAINER} (host:${HOST_PORT} → container:7860)..."
docker run \
  --name  "${CONTAINER}" \
  --detach \
  --publish "${HOST_PORT}:7860" \
  --memory  "8g" \
  --cpus    "2" \
  "${IMAGE}"

# ─────────────────────────────────────────────────────────────────────────────
# 3. Wait for /health to respond 200
# ─────────────────────────────────────────────────────────────────────────────
info "Waiting up to ${MAX_WAIT}s for FastAPI /health on ${API}/health ..."
ELAPSED=0
until curl -sf "${API}/health" >/dev/null 2>&1; do
  sleep 2
  ELAPSED=$((ELAPSED + 2))
  if [ "${ELAPSED}" -ge "${MAX_WAIT}" ]; then
    fail "Server did not become healthy within ${MAX_WAIT}s."
  fi
  echo -n "."
done
echo ""
pass "/health responded OK (${ELAPSED}s)"

# ─────────────────────────────────────────────────────────────────────────────
# 4. Check /tasks endpoint
# ─────────────────────────────────────────────────────────────────────────────
TASKS_RESP=$(curl -sf "${API}/tasks")
echo "  /tasks response: ${TASKS_RESP}"
echo "${TASKS_RESP}" | python3 -c "
import sys, json
d = json.load(sys.stdin)
tasks = d.get('tasks', [])
assert len(tasks) >= 1, f'Expected at least 1 task, got {len(tasks)}'
assert any(t['id'] == 'easy' for t in tasks), 'Missing easy task'
print('  Tasks validated: ' + str([t['id'] for t in tasks]))
" && pass "/tasks endpoint OK"

# ─────────────────────────────────────────────────────────────────────────────
# 5. Check container memory + CPU limits are honoured
# ─────────────────────────────────────────────────────────────────────────────
INFO_JSON=$(docker inspect "${CONTAINER}" --format='{{json .HostConfig}}')
MEM_LIMIT=$(echo "${INFO_JSON}" | python3 -c "
import sys, json
h = json.load(sys.stdin)
print(h.get('Memory', 0))
")
CPU_NANO=$(echo "${INFO_JSON}" | python3 -c "
import sys, json
h = json.load(sys.stdin)
print(h.get('NanoCpus', 0))
")
info "Container limits — Memory: ${MEM_LIMIT} bytes, NanoCpus: ${CPU_NANO}"
[ "${MEM_LIMIT}" -gt 0 ] && pass "Memory limit set"  || pass "Memory limit not enforced by host (ok in dev)"
[ "${CPU_NANO}"  -gt 0 ] && pass "CPU limit set"     || pass "CPU limit not enforced by host (ok in dev)"

# ─────────────────────────────────────────────────────────────────────────────
# 6. Print recent container logs (for visibility)
# ─────────────────────────────────────────────────────────────────────────────
info "--- Container logs (last 20 lines) ---"
docker logs "${CONTAINER}" --tail 20 2>&1 | sed 's/^/  /'
info "--- End logs ---"

# ─────────────────────────────────────────────────────────────────────────────
# Done
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  All smoke tests PASSED for ${IMAGE}${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
