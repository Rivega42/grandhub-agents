#!/usr/bin/env bash
# scripts/typecheck.sh <service>
# Запускает tsc --noEmit для указанного сервиса и возвращает JSON с результатами

set -euo pipefail

SERVICE="${1:-}"
GRANDHUB_ROOT="${GRANDHUB_ROOT:-/opt/grandhub-v3}"
SERVICE_DIR="$GRANDHUB_ROOT/services/$SERVICE"
START_MS=$(date +%s%3N)

if [ -z "$SERVICE" ]; then
  echo '{"success":false,"service":"","step":"typecheck","duration_ms":0,"errors":["Укажите имя сервиса: typecheck.sh <service>"],"output":""}'
  exit 1
fi

if [ ! -d "$SERVICE_DIR" ]; then
  END_MS=$(date +%s%3N)
  DURATION=$((END_MS - START_MS))
  echo "{\"success\":false,\"service\":\"$SERVICE\",\"step\":\"typecheck\",\"duration_ms\":$DURATION,\"errors\":[\"Директория не найдена: $SERVICE_DIR\"],\"output\":\"\"}"
  exit 1
fi

cd "$SERVICE_DIR"

# Проверяем tsconfig.json
if [ ! -f "tsconfig.json" ]; then
  END_MS=$(date +%s%3N)
  DURATION=$((END_MS - START_MS))
  echo "{\"success\":false,\"service\":\"$SERVICE\",\"step\":\"typecheck\",\"duration_ms\":$DURATION,\"errors\":[\"tsconfig.json не найден в $SERVICE_DIR\"],\"output\":\"\"}"
  exit 1
fi

# Запускаем tsc
TSC_OUTPUT=$(pnpm exec tsc --noEmit 2>&1 || true)
TSC_EXIT=$?

END_MS=$(date +%s%3N)
DURATION=$((END_MS - START_MS))

# Парсим ошибки TypeScript
ERRORS=$(echo "$TSC_OUTPUT" | grep -E "error TS[0-9]+" | head -20 | \
  node -e "
const lines = require('fs').readFileSync('/dev/stdin','utf8').trim().split('\n').filter(Boolean);
const errors = lines.map(l => l.trim());
console.log(JSON.stringify(errors));
" 2>/dev/null || echo '[]')

ERROR_COUNT=$(echo "$TSC_OUTPUT" | grep -c "error TS" 2>/dev/null || echo "0")

if [ "$TSC_EXIT" -eq 0 ] || [ "$ERROR_COUNT" -eq 0 ]; then
  SUCCESS="true"
  ERRORS="[]"
else
  SUCCESS="false"
fi

SAFE_OUTPUT=$(echo "$TSC_OUTPUT" | head -c 2000 | sed 's/\\/\\\\/g; s/"/\\"/g; s/$/\\n/' | tr -d '\n')

cat <<EOF
{
  "success": $SUCCESS,
  "service": "$SERVICE",
  "step": "typecheck",
  "duration_ms": $DURATION,
  "errors": $ERRORS,
  "output": "$SAFE_OUTPUT"
}
EOF
