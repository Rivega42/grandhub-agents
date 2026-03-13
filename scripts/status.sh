#!/usr/bin/env bash
# scripts/status.sh
# Возвращает статус всех сервисов GrandHub в JSON
# Проверяет: PM2 статус, порты, health endpoints

set -euo pipefail

GRANDHUB_ROOT="${GRANDHUB_ROOT:-/opt/grandhub-v3}"
START_MS=$(date +%s%3N)

# Список сервисов и их порты
declare -A SERVICE_PORTS=(
  ["auth"]="4001"
  ["api-gateway"]="4000"
  ["assistant-runtime"]="4005"
  ["websocket"]="4014"
  ["billing"]="4003"
)

# Функция проверки PM2 статуса сервиса
check_pm2_status() {
  local SERVICE="$1"
  local PM2_STATUS
  PM2_STATUS=$(pm2 jlist 2>/dev/null | node -e "
try {
  const list = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const svc = list.find(p => p.name === '$SERVICE' || p.name.includes('$SERVICE'));
  if (svc) {
    console.log(JSON.stringify({
      status: svc.pm2_env?.status || 'unknown',
      pid: svc.pid || null,
      uptime: svc.pm2_env?.pm_uptime ? Date.now() - svc.pm2_env.pm_uptime : null,
      restarts: svc.pm2_env?.restart_time || 0,
      cpu: svc.monit?.cpu || 0,
      memory_mb: svc.monit?.memory ? Math.round(svc.monit.memory / 1024 / 1024) : 0
    }));
  } else {
    console.log(JSON.stringify({status: 'not_found', pid: null, uptime: null, restarts: 0, cpu: 0, memory_mb: 0}));
  }
} catch(e) {
  console.log(JSON.stringify({status: 'error', pid: null, uptime: null, restarts: 0, cpu: 0, memory_mb: 0}));
}
" 2>/dev/null || echo '{"status":"error","pid":null,"uptime":null,"restarts":0,"cpu":0,"memory_mb":0}')
  echo "$PM2_STATUS"
}

# Функция проверки HTTP health
check_http_health() {
  local SERVICE="$1"
  local PORT="${SERVICE_PORTS[$SERVICE]:-0}"
  
  if [ "$PORT" = "0" ]; then
    echo '{"healthy":false,"status_code":0,"response_ms":0}'
    return
  fi
  
  local START=$(date +%s%3N)
  local HTTP_CODE
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 --max-time 5 "http://localhost:$PORT/health" 2>/dev/null || echo "0")
  local END=$(date +%s%3N)
  local RESP_MS=$((END - START))
  
  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "204" ]; then
    echo "{\"healthy\":true,\"status_code\":$HTTP_CODE,\"response_ms\":$RESP_MS}"
  else
    echo "{\"healthy\":false,\"status_code\":$HTTP_CODE,\"response_ms\":$RESP_MS}"
  fi
}

# Собираем статус по всем сервисам
SERVICES_JSON=""
TOTAL=0
HEALTHY=0

for SERVICE in "${!SERVICE_PORTS[@]}"; do
  PORT="${SERVICE_PORTS[$SERVICE]}"
  
  PM2_INFO=$(check_pm2_status "$SERVICE")
  HTTP_INFO=$(check_http_health "$SERVICE")
  
  PM2_STATUS=$(echo "$PM2_INFO" | node -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).status)" 2>/dev/null || echo "unknown")
  HTTP_HEALTHY=$(echo "$HTTP_INFO" | node -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).healthy)" 2>/dev/null || echo "false")
  
  TOTAL=$((TOTAL + 1))
  if [ "$HTTP_HEALTHY" = "true" ] && [ "$PM2_STATUS" = "online" ]; then
    HEALTHY=$((HEALTHY + 1))
    STATUS="healthy"
  elif [ "$PM2_STATUS" = "online" ]; then
    STATUS="running_no_health"
  else
    STATUS="down"
  fi
  
  SERVICE_JSON="{\"service\":\"$SERVICE\",\"port\":$PORT,\"status\":\"$STATUS\",\"pm2\":$PM2_INFO,\"http\":$HTTP_INFO}"
  
  if [ -z "$SERVICES_JSON" ]; then
    SERVICES_JSON="$SERVICE_JSON"
  else
    SERVICES_JSON="$SERVICES_JSON,$SERVICE_JSON"
  fi
done

END_MS=$(date +%s%3N)
DURATION=$((END_MS - START_MS))

# Общий статус системы
if [ "$HEALTHY" -eq "$TOTAL" ]; then
  OVERALL="all_healthy"
elif [ "$HEALTHY" -gt 0 ]; then
  OVERALL="partial"
else
  OVERALL="all_down"
fi

cat <<EOF
{
  "success": true,
  "step": "status",
  "duration_ms": $DURATION,
  "overall": "$OVERALL",
  "healthy_count": $HEALTHY,
  "total_count": $TOTAL,
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "services": [$SERVICES_JSON]
}
EOF
