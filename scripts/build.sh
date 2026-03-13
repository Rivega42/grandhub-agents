#!/usr/bin/env bash
# scripts/build.sh <service>
# Собирает указанный сервис и возвращает JSON со статусом

set -euo pipefail

SERVICE="${1:-}"
GRANDHUB_ROOT="${GRANDHUB_ROOT:-/opt/grandhub-v3}"
SERVICE_DIR="$GRANDHUB_ROOT/services/$SERVICE"
START_MS=$(date +%s%3N)

if [ -z "$SERVICE" ]; then
  echo '{"success":false,"service":"","step":"build","duration_ms":0,"errors":["Укажите имя сервиса: build.sh <service>"],"output":""}'
  exit 1
fi

if [ ! -d "$SERVICE_DIR" ]; then
  END_MS=$(date +%s%3N)
  DURATION=$((END_MS - START_MS))
  echo "{\"success\":false,\"service\":\"$SERVICE\",\"step\":\"build\",\"duration_ms\":$DURATION,\"errors\":[\"Директория не найдена: $SERVICE_DIR\"],\"output\":\"\"}"
  exit 1
fi

cd "$SERVICE_DIR"

# Проверяем скрипт сборки
PACKAGE_JSON=$(cat package.json 2>/dev/null || echo '{}')
BUILD_SCRIPT=$(echo "$PACKAGE_JSON" | node -e "const p=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(p.scripts?.build || '')" 2>/dev/null || echo "")

if [ -z "$BUILD_SCRIPT" ]; then
  END_MS=$(date +%s%3N)
  DURATION=$((END_MS - START_MS))
  echo "{\"success\":false,\"service\":\"$SERVICE\",\"step\":\"build\",\"duration_ms\":$DURATION,\"errors\":[\"Скрипт build не найден в package.json\"],\"output\":\"\"}"
  exit 1
fi

# Запускаем сборку
BUILD_OUTPUT=$(pnpm build 2>&1)
BUILD_EXIT=$?

END_MS=$(date +%s%3N)
DURATION=$((END_MS - START_MS))

if [ "$BUILD_EXIT" -eq 0 ]; then
  SUCCESS="true"
  ERRORS="[]"
  
  # Определяем размер артефакта
  DIST_SIZE=""
  if [ -d "dist" ]; then
    DIST_SIZE=$(du -sh dist 2>/dev/null | cut -f1 || echo "неизвестно")
  fi
  
  SAFE_OUTPUT=$(echo "$BUILD_OUTPUT" | tail -20 | sed 's/\\/\\\\/g; s/"/\\"/g; s/$/\\n/' | tr -d '\n')
  
  cat <<EOF
{
  "success": true,
  "service": "$SERVICE",
  "step": "build",
  "duration_ms": $DURATION,
  "dist_size": "${DIST_SIZE:-unknown}",
  "errors": [],
  "output": "$SAFE_OUTPUT"
}
EOF
else
  ERRORS=$(echo "$BUILD_OUTPUT" | grep -iE "error|Error" | head -10 | \
    node -e "
const lines = require('fs').readFileSync('/dev/stdin','utf8').trim().split('\n').filter(Boolean);
console.log(JSON.stringify(lines.map(l => l.trim())));
" 2>/dev/null || echo '[]')
  
  SAFE_OUTPUT=$(echo "$BUILD_OUTPUT" | head -c 2000 | sed 's/\\/\\\\/g; s/"/\\"/g; s/$/\\n/' | tr -d '\n')
  
  cat <<EOF
{
  "success": false,
  "service": "$SERVICE",
  "step": "build",
  "duration_ms": $DURATION,
  "errors": $ERRORS,
  "output": "$SAFE_OUTPUT"
}
EOF
fi
