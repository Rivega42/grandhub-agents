#!/usr/bin/env bash
# scripts/health-check.sh <service>
# Выполняет HTTP health check для указанного сервиса и возвращает JSON

set -euo pipefail

SERVICE="${1:-}"
START_MS=$(date +%s%3N)

if [ -z "$SERVICE" ]; then
  echo '{"success":false,"service":"","step":"health-check","duration_ms":0,"errors":["Укажите имя сервиса: health-check.sh <service>"],"output":""}'
  exit 1
fi

# Порты сервисов
declare -A SERVICE_PORTS=(
  ["auth"]="4001"
  ["api-gateway"]="4000"
  ["assistant-runtime"]="4005"
  ["websocket"]="4014"
  ["billing"]="4003"
)

PORT="${SERVICE_PORTS[$SERVICE]:-}"

if [ -z "$PORT" ]; then
  # Попробуем получить порт из package.json
  GRANDHUB_ROOT="${GRANDHUB_ROOT:-/opt/grandhub-v3}"
  SERVICE_DIR="$GRANDHUB_ROOT/services/$SERVICE"
  if [ -f "$SERVICE_DIR/.env" ]; then
    PORT=$(grep "^PORT=" "$SERVICE_DIR/.env" 2>/dev/null | cut -d= -f2 | tr -d '"' | tr -d "'" || echo "")
  fi
  
  if [ -z "$PORT" ]; then
    END_MS=$(date +%s%3N)
    DURATION=$((END_MS - START_MS))
    echo "{\"success\":false,\"service\":\"$SERVICE\",\"step\":\"health-check\",\"duration_ms\":$DURATION,\"errors\":[\"Неизвестный сервис: $SERVICE. Доступны: auth, api-gateway, assistant-runtime, websocket, billing\"],\"output\":\"\"}"
    exit 1
  fi
fi

HEALTH_URL="http://localhost:$PORT/health"

# Выполняем запрос
HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" --connect-timeout 5 --max-time 10 "$HEALTH_URL" 2>&1 || echo -e "\n0")
HTTP_BODY=$(echo "$HTTP_RESPONSE" | head -n -1)
HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -n 1)

END_MS=$(date +%s%3N)
DURATION=$((END_MS - START_MS))

# Парсим тело ответа
SAFE_BODY=$(echo "$HTTP_BODY" | head -c 500 | sed 's/\\/\\\\/g; s/"/\\"/g; s/$/\\n/' | tr -d '\n')

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "204" ]; then
  SUCCESS="true"
  ERRORS="[]"
else
  SUCCESS="false"
  ERRORS="[\"HTTP $HTTP_CODE от $HEALTH_URL\"]"
fi

cat <<EOF
{
  "success": $SUCCESS,
  "service": "$SERVICE",
  "step": "health-check",
  "duration_ms": $DURATION,
  "port": $PORT,
  "url": "$HEALTH_URL",
  "http_code": $HTTP_CODE,
  "errors": $ERRORS,
  "output": "$SAFE_BODY"
}
EOF
