#!/usr/bin/env bash
# scripts/deploy.sh <service>
# Деплоит сервис: pull → install → build → pm2 reload → health check
# Возвращает JSON со статусом деплоя

set -euo pipefail

SERVICE="${1:-}"
GRANDHUB_ROOT="${GRANDHUB_ROOT:-/opt/grandhub-v3}"
SERVICE_DIR="$GRANDHUB_ROOT/services/$SERVICE"
SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
START_MS=$(date +%s%3N)

if [ -z "$SERVICE" ]; then
  echo '{"success":false,"service":"","step":"deploy","duration_ms":0,"errors":["Укажите имя сервиса: deploy.sh <service>"],"output":""}'
  exit 1
fi

if [ ! -d "$SERVICE_DIR" ]; then
  END_MS=$(date +%s%3N)
  DURATION=$((END_MS - START_MS))
  echo "{\"success\":false,\"service\":\"$SERVICE\",\"step\":\"deploy\",\"duration_ms\":$DURATION,\"errors\":[\"Директория не найдена: $SERVICE_DIR\"],\"output\":\"\"}"
  exit 1
fi

echo "🚀 Деплой сервиса: $SERVICE" >&2
DEPLOY_LOG=""

# Шаг 1: Сохраняем текущий коммит для rollback
cd "$GRANDHUB_ROOT"
PREV_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
echo "  📌 Текущий коммит: $PREV_COMMIT" >&2
DEPLOY_LOG="prev_commit=$PREV_COMMIT\n"

# Шаг 2: Git pull
echo "  📥 Git pull..." >&2
GIT_OUTPUT=$(git pull --rebase 2>&1 || true)
DEPLOY_LOG="$DEPLOY_LOG\ngit_pull: $GIT_OUTPUT"

# Шаг 3: Install зависимостей
echo "  📦 Установка зависимостей..." >&2
cd "$SERVICE_DIR"
INSTALL_OUTPUT=$(pnpm install --frozen-lockfile 2>&1 || pnpm install 2>&1)
INSTALL_EXIT=$?
DEPLOY_LOG="$DEPLOY_LOG\ninstall: exit=$INSTALL_EXIT"

if [ "$INSTALL_EXIT" -ne 0 ]; then
  END_MS=$(date +%s%3N)
  DURATION=$((END_MS - START_MS))
  SAFE_LOG=$(echo "$INSTALL_OUTPUT" | head -c 1000 | sed 's/\\/\\\\/g; s/"/\\"/g; s/$/\\n/' | tr -d '\n')
  echo "{\"success\":false,\"service\":\"$SERVICE\",\"step\":\"deploy\",\"failed_at\":\"install\",\"duration_ms\":$DURATION,\"errors\":[\"Ошибка установки зависимостей\"],\"output\":\"$SAFE_LOG\"}"
  exit 1
fi

# Шаг 4: Eval Loop (lint + typecheck + test + build)
echo "  🔄 Запуск Eval Loop..." >&2
EVAL_OUTPUT=$("$SCRIPTS_DIR/eval-loop.sh" "$SERVICE" 2>/dev/null)
EVAL_SUCCESS=$(echo "$EVAL_OUTPUT" | node -e "try{const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.success?'true':'false')}catch(e){console.log('false')}" 2>/dev/null || echo "false")

if [ "$EVAL_SUCCESS" != "true" ]; then
  END_MS=$(date +%s%3N)
  DURATION=$((END_MS - START_MS))
  echo "{\"success\":false,\"service\":\"$SERVICE\",\"step\":\"deploy\",\"failed_at\":\"eval-loop\",\"duration_ms\":$DURATION,\"errors\":[\"Eval Loop не прошёл — откат деплоя\"],\"eval_result\":$EVAL_OUTPUT}"
  exit 1
fi

# Шаг 5: PM2 reload
echo "  🔄 PM2 reload..." >&2
PM2_OUTPUT=$(pm2 reload "$SERVICE" --update-env 2>&1 || pm2 restart "$SERVICE" --update-env 2>&1 || true)
PM2_EXIT=$?
DEPLOY_LOG="$DEPLOY_LOG\npm2: $PM2_OUTPUT"

if [ "$PM2_EXIT" -ne 0 ]; then
  # Пробуем запустить через ecosystem
  ECOSYSTEM="$GRANDHUB_ROOT/ecosystem.config.js"
  if [ -f "$ECOSYSTEM" ]; then
    PM2_OUTPUT=$(pm2 start "$ECOSYSTEM" --only "$SERVICE" 2>&1 || true)
  fi
fi

# Шаг 6: Ждём health check (до 30 секунд)
echo "  🏥 Ожидание health check..." >&2
HEALTH_OK=false
for i in $(seq 1 10); do
  sleep 3
  HEALTH_OUTPUT=$("$SCRIPTS_DIR/health-check.sh" "$SERVICE" 2>/dev/null)
  HEALTH_SUCCESS=$(echo "$HEALTH_OUTPUT" | node -e "try{const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.success?'true':'false')}catch(e){console.log('false')}" 2>/dev/null || echo "false")
  
  if [ "$HEALTH_SUCCESS" = "true" ]; then
    HEALTH_OK=true
    echo "  ✅ Health check прошёл (попытка $i/10)" >&2
    break
  fi
  echo "  ⏳ Попытка $i/10..." >&2
done

END_MS=$(date +%s%3N)
DURATION=$((END_MS - START_MS))
NEW_COMMIT=$(git -C "$GRANDHUB_ROOT" rev-parse HEAD 2>/dev/null || echo "unknown")

if [ "$HEALTH_OK" = "true" ]; then
  echo "  ✅ Деплой завершён успешно!" >&2
  cat <<EOF
{
  "success": true,
  "service": "$SERVICE",
  "step": "deploy",
  "duration_ms": $DURATION,
  "prev_commit": "$PREV_COMMIT",
  "new_commit": "$NEW_COMMIT",
  "errors": [],
  "output": "Деплой $SERVICE успешен. Время: ${DURATION}ms"
}
EOF
else
  echo "  ❌ Health check не прошёл — запустите rollback.sh $SERVICE" >&2
  cat <<EOF
{
  "success": false,
  "service": "$SERVICE",
  "step": "deploy",
  "duration_ms": $DURATION,
  "prev_commit": "$PREV_COMMIT",
  "new_commit": "$NEW_COMMIT",
  "errors": ["Health check не прошёл после деплоя. Запустите: ./scripts/rollback.sh $SERVICE"],
  "output": "Деплой завершён, но сервис не отвечает на /health"
}
EOF
  exit 1
fi
