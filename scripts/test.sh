#!/usr/bin/env bash
# scripts/test.sh <service>
# Запускает тесты (vitest/jest) для указанного сервиса и возвращает JSON

set -euo pipefail

SERVICE="${1:-}"
GRANDHUB_ROOT="${GRANDHUB_ROOT:-/opt/grandhub-v3}"
SERVICE_DIR="$GRANDHUB_ROOT/services/$SERVICE"
START_MS=$(date +%s%3N)

if [ -z "$SERVICE" ]; then
  echo '{"success":false,"service":"","step":"test","duration_ms":0,"errors":["Укажите имя сервиса: test.sh <service>"],"output":""}'
  exit 1
fi

if [ ! -d "$SERVICE_DIR" ]; then
  END_MS=$(date +%s%3N)
  DURATION=$((END_MS - START_MS))
  echo "{\"success\":false,\"service\":\"$SERVICE\",\"step\":\"test\",\"duration_ms\":$DURATION,\"errors\":[\"Директория не найдена: $SERVICE_DIR\"],\"output\":\"\"}"
  exit 1
fi

cd "$SERVICE_DIR"

# Определяем тест-раннер
PACKAGE_JSON=$(cat package.json 2>/dev/null || echo '{}')
HAS_VITEST=$(echo "$PACKAGE_JSON" | node -e "const p=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(p.devDependencies?.vitest || p.dependencies?.vitest ? 'yes' : 'no')" 2>/dev/null || echo "no")
HAS_JEST=$(echo "$PACKAGE_JSON" | node -e "const p=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(p.devDependencies?.jest || p.dependencies?.jest ? 'yes' : 'no')" 2>/dev/null || echo "no")
TEST_SCRIPT=$(echo "$PACKAGE_JSON" | node -e "const p=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(p.scripts?.test || '')" 2>/dev/null || echo "")

# Запускаем тесты
if [ -n "$TEST_SCRIPT" ] && [ "$TEST_SCRIPT" != "echo \"Error: no test specified\" && exit 1" ]; then
  TEST_OUTPUT=$(timeout 300 pnpm test --run 2>&1 || timeout 300 pnpm test 2>&1 || true)
elif [ "$HAS_VITEST" = "yes" ]; then
  TEST_OUTPUT=$(timeout 300 pnpm exec vitest run 2>&1 || true)
elif [ "$HAS_JEST" = "yes" ]; then
  TEST_OUTPUT=$(timeout 300 pnpm exec jest --passWithNoTests 2>&1 || true)
else
  END_MS=$(date +%s%3N)
  DURATION=$((END_MS - START_MS))
  echo "{\"success\":true,\"service\":\"$SERVICE\",\"step\":\"test\",\"duration_ms\":$DURATION,\"errors\":[],\"output\":\"Тесты не настроены для этого сервиса\"}"
  exit 0
fi

TEST_EXIT=$?
END_MS=$(date +%s%3N)
DURATION=$((END_MS - START_MS))

# Определяем результат
PASSED=$(echo "$TEST_OUTPUT" | grep -oE "[0-9]+ passed" | head -1 | grep -oE "[0-9]+" || echo "0")
FAILED=$(echo "$TEST_OUTPUT" | grep -oE "[0-9]+ failed" | head -1 | grep -oE "[0-9]+" || echo "0")

if [ "$TEST_EXIT" -eq 0 ] && [ "${FAILED:-0}" -eq 0 ]; then
  SUCCESS="true"
  ERRORS="[]"
else
  SUCCESS="false"
  FAIL_LINES=$(echo "$TEST_OUTPUT" | grep -E "FAIL|✕|× |● " | head -10 | \
    node -e "
const lines = require('fs').readFileSync('/dev/stdin','utf8').trim().split('\n').filter(Boolean);
console.log(JSON.stringify(lines.map(l => l.trim())));
" 2>/dev/null || echo '[]')
  ERRORS="$FAIL_LINES"
fi

SAFE_OUTPUT=$(echo "$TEST_OUTPUT" | head -c 3000 | sed 's/\\/\\\\/g; s/"/\\"/g; s/$/\\n/' | tr -d '\n')

cat <<EOF
{
  "success": $SUCCESS,
  "service": "$SERVICE",
  "step": "test",
  "duration_ms": $DURATION,
  "passed": ${PASSED:-0},
  "failed": ${FAILED:-0},
  "errors": $ERRORS,
  "output": "$SAFE_OUTPUT"
}
EOF
