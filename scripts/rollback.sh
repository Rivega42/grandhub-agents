#!/usr/bin/env bash
# scripts/rollback.sh <service>
# Откатывает сервис к предыдущей рабочей версии
# Использует git для отката и PM2 для перезапуска

set -euo pipefail

SERVICE="${1:-}"
GRANDHUB_ROOT="${GRANDHUB_ROOT:-/opt/grandhub-v3}"
SERVICE_DIR="$GRANDHUB_ROOT/services/$SERVICE"
SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
CHECKPOINT_DIR="${CHECKPOINT_DIR:-/tmp/grandhub-checkpoints}"
START_MS=$(date +%s%3N)

if [ -z "$SERVICE" ]; then
  echo '{"success":false,"service":"","step":"rollback","duration_ms":0,"errors":["Укажите имя сервиса: rollback.sh <service>"],"output":""}'
  exit 1
fi

echo "🔙 Откат сервиса: $SERVICE" >&2

CURRENT_COMMIT=$(git -C "$GRANDHUB_ROOT" rev-parse HEAD 2>/dev/null || echo "unknown")
echo "  📌 Текущий коммит: $CURRENT_COMMIT" >&2

# Ищем предыдущий рабочий коммит в checkpoint
ROLLBACK_TO=""
CHECKPOINT_FILE="$CHECKPOINT_DIR/last_successful_deploy_${SERVICE}.json"

if [ -f "$CHECKPOINT_FILE" ]; then
  ROLLBACK_TO=$(cat "$CHECKPOINT_FILE" | node -e "
try {
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log(d.commit || '');
} catch(e) { console.log(''); }
" 2>/dev/null || echo "")
  echo "  🎯 Целевой коммит из checkpoint: $ROLLBACK_TO" >&2
fi

if [ -z "$ROLLBACK_TO" ]; then
  # Берём предыдущий коммит
  ROLLBACK_TO=$(git -C "$GRANDHUB_ROOT" rev-parse HEAD~1 2>/dev/null || echo "")
  echo "  🎯 Откат к предыдущему коммиту: $ROLLBACK_TO" >&2
fi

if [ -z "$ROLLBACK_TO" ]; then
  END_MS=$(date +%s%3N)
  DURATION=$((END_MS - START_MS))
  echo "{\"success\":false,\"service\":\"$SERVICE\",\"step\":\"rollback\",\"duration_ms\":$DURATION,\"errors\":[\"Не удалось определить коммит для отката\"],\"output\":\"\"}"
  exit 1
fi

# Откат git
echo "  ⏪ Откат git к $ROLLBACK_TO..." >&2
GIT_OUTPUT=$(git -C "$GRANDHUB_ROOT" reset --hard "$ROLLBACK_TO" 2>&1)
GIT_EXIT=$?

if [ "$GIT_EXIT" -ne 0 ]; then
  END_MS=$(date +%s%3N)
  DURATION=$((END_MS - START_MS))
  SAFE_OUTPUT=$(echo "$GIT_OUTPUT" | sed 's/"/\\"/g')
  echo "{\"success\":false,\"service\":\"$SERVICE\",\"step\":\"rollback\",\"duration_ms\":$DURATION,\"errors\":[\"Ошибка git reset: $SAFE_OUTPUT\"],\"output\":\"\"}"
  exit 1
fi

# Переустанавливаем зависимости и пересобираем
cd "$SERVICE_DIR"
echo "  📦 Установка зависимостей..." >&2
pnpm install --frozen-lockfile 2>&1 || pnpm install 2>&1 || true

echo "  🔨 Сборка..." >&2
pnpm build 2>&1 || true

# Перезапускаем сервис
echo "  🔄 Перезапуск PM2..." >&2
pm2 reload "$SERVICE" --update-env 2>&1 || pm2 restart "$SERVICE" --update-env 2>&1 || true

# Health check
sleep 5
HEALTH_OUTPUT=$("$SCRIPTS_DIR/health-check.sh" "$SERVICE" 2>/dev/null)
HEALTH_SUCCESS=$(echo "$HEALTH_OUTPUT" | node -e "try{const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.success?'true':'false')}catch(e){console.log('false')}" 2>/dev/null || echo "false")

END_MS=$(date +%s%3N)
DURATION=$((END_MS - START_MS))

if [ "$HEALTH_SUCCESS" = "true" ]; then
  echo "  ✅ Откат успешен!" >&2
  cat <<EOF
{
  "success": true,
  "service": "$SERVICE",
  "step": "rollback",
  "duration_ms": $DURATION,
  "rolled_back_from": "$CURRENT_COMMIT",
  "rolled_back_to": "$ROLLBACK_TO",
  "errors": [],
  "output": "Откат $SERVICE выполнен успешно"
}
EOF
else
  echo "  ❌ Откат выполнен, но health check не прошёл" >&2
  cat <<EOF
{
  "success": false,
  "service": "$SERVICE",
  "step": "rollback",
  "duration_ms": $DURATION,
  "rolled_back_from": "$CURRENT_COMMIT",
  "rolled_back_to": "$ROLLBACK_TO",
  "errors": ["Health check не прошёл после отката. Требуется ручное вмешательство."],
  "output": "Откат выполнен, сервис не отвечает"
}
EOF
  exit 1
fi
