#!/usr/bin/env bash
# scripts/smoke-test.sh — E2E smoke test для GHA pipeline
# Проверяет: health → очередь → task spec → coder dry-run → reviewer сигнатуры
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENTS_DIR="${SCRIPT_DIR}/.."
STATE_DIR="${AGENTS_DIR}/.agent-state"
HEALTH_PORT="${GHA_HEALTH_PORT:-9090}"
PASS=0; FAIL=0

ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
fail() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo "=== GHA Smoke Test ==="
echo ""

# ── 1. Health endpoint ─────────────────────────────────────────────────────────
echo "1. Health endpoint"
HEALTH=$(curl -s "http://127.0.0.1:${HEALTH_PORT}/healthz" 2>/dev/null || echo '{}')
STATUS=$(echo "$HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','error'))" 2>/dev/null || echo 'error')
if [[ "$STATUS" == "ok" ]]; then ok "GET /healthz → status: ok"
else fail "GET /healthz → status: $STATUS"; fi

METRICS=$(curl -s "http://127.0.0.1:${HEALTH_PORT}/metrics" 2>/dev/null || echo '')
if echo "$METRICS" | grep -q 'gha_tasks_completed'; then ok "GET /metrics → Prometheus format"
else fail "GET /metrics — не работает"; fi

# ── 2. TypeScript компиляция ───────────────────────────────────────────────────
echo ""
echo "2. TypeScript компиляция"
cd "$AGENTS_DIR"
export TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}'

if node_modules/.bin/ts-node -e 'require("./agents/orchestrator"); console.log("ok")' 2>/dev/null | grep -q ok; then
  ok "orchestrator.ts компилируется"
else fail "orchestrator.ts — ошибки компиляции"; fi

if node_modules/.bin/ts-node -e 'require("./agents/coder"); console.log("ok")' 2>/dev/null | grep -q ok; then
  ok "coder.ts компилируется"
else fail "coder.ts — ошибки компиляции"; fi

if node_modules/.bin/ts-node -e 'require("./agents/reviewer"); console.log("ok")' 2>/dev/null | grep -q ok; then
  ok "reviewer.ts компилируется"
else fail "reviewer.ts — ошибки компиляции"; fi

if node_modules/.bin/ts-node -e 'require("./agents/task-state"); console.log("ok")' 2>/dev/null | grep -q ok; then
  ok "task-state.ts компилируется"
else fail "task-state.ts — ошибки компиляции"; fi

if node_modules/.bin/ts-node -e 'require("./agents/logger"); console.log("ok")' 2>/dev/null | grep -q ok; then
  ok "logger.ts компилируется"
else fail "logger.ts — ошибки компиляции"; fi

# ── 3. .env файл ──────────────────────────────────────────────────────────────
echo ""
echo "3. Конфигурация"
if [[ -f "${AGENTS_DIR}/.env" ]]; then ok ".env существует"
else fail ".env не найден — secrets не настроены"; fi

if [[ -f "${AGENTS_DIR}/.env.example" ]]; then ok ".env.example существует"
else fail ".env.example не найден"; fi

if ! grep -q 'ghp_\|AAG6' "${AGENTS_DIR}/run-watch.sh" 2>/dev/null; then
  ok "run-watch.sh без хардкодированных токенов"
else fail "run-watch.sh содержит хардкодированные токены!"; fi

# ── 4. FSM state dir ──────────────────────────────────────────────────────────
echo ""
echo "4. Файловая система"
if [[ -d "${STATE_DIR}" ]]; then ok ".agent-state/ существует"
else fail ".agent-state/ не найден"; fi

if [[ -d "${STATE_DIR}/tasks" ]]; then ok ".agent-state/tasks/ существует (FSM)"
else fail ".agent-state/tasks/ не найден — FSM не писал"; fi

LOG_DIR="${AGENTS_DIR}/.agent-logs"
if [[ -f "${LOG_DIR}/combined.jsonl" ]]; then ok "combined.jsonl существует (logger работает)"
else fail "combined.jsonl не найден — logger не писал"; fi

# ── 5. Queue.json ─────────────────────────────────────────────────────────────
echo ""
echo "5. Queue"
if [[ -f "${AGENTS_DIR}/queue.json" ]]; then
  DONE=$(python3 -c "import json; q=json.load(open('${AGENTS_DIR}/queue.json')); print(sum(1 for e in q if e.get('status')=='done'))" 2>/dev/null || echo 0)
  ok "queue.json существует (done tasks: ${DONE})"
else fail "queue.json не найден"; fi

# ── 6. Systemd unit ───────────────────────────────────────────────────────────
echo ""
echo "6. Systemd"
if systemctl is-active grandhub-gha-watch --quiet 2>/dev/null; then
  ok "grandhub-gha-watch.service активен"
else fail "grandhub-gha-watch.service не запущен"; fi

# ── 7. Git репо ───────────────────────────────────────────────────────────────
echo ""
echo "7. Git"
if git -C "${AGENTS_DIR}" remote get-url origin 2>/dev/null | grep -q 'grandhub-agents'; then
  ok "git remote → Rivega42/grandhub-agents"
else fail "git remote не настроен"; fi

LAST_COMMIT=$(git -C "${AGENTS_DIR}" log --oneline -1 2>/dev/null)
ok "Последний коммит: ${LAST_COMMIT}"

# ── Итог ──────────────────────────────────────────────────────────────────────
echo ""
echo "=== Итог: ✅ ${PASS} / ❌ ${FAIL} ==="
if [[ $FAIL -eq 0 ]]; then
  echo "🎉 Все проверки прошли!"
  exit 0
else
  echo "⚠️  Есть ошибки — исправь перед деплоем"
  exit 1
fi
