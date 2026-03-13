#!/bin/bash
# lock.sh — управление файловыми блокировками для агентов GHA
# Использует flock для атомарных операций с блокировками
# Вывод: JSON в stdout, логи в stderr
# Использование: lock.sh <acquire|release|check> --service <name> --task-id <id> [--timeout <sec>]

set -euo pipefail

ACTION="${1:-}"
SERVICE=""
TASK_ID=""
TIMEOUT_SEC=10
LOCKS_DIR=".agent-locks"
SCRIPT_NAME="lock.sh"

# Разбор аргументов
shift || true
while [[ $# -gt 0 ]]; do
  case $1 in
    --service) SERVICE="$2"; shift 2 ;;
    --task-id) TASK_ID="$2"; shift 2 ;;
    --timeout) TIMEOUT_SEC="$2"; shift 2 ;;
    --help) echo "Usage: lock.sh <acquire|release|check> --service <name> --task-id <id>"; exit 0 ;;
    *) shift ;;
  esac
done

if [[ -z "$SERVICE" ]]; then
  echo '{"success":false,"error":"--service обязателен"}' >&1
  exit 1
fi

LOCK_FILE="${LOCKS_DIR}/${SERVICE}.lock"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EXPIRES_AT=$(date -u -d "+${TIMEOUT_SEC} minutes" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%SZ")

mkdir -p "$LOCKS_DIR"

output_json() {
  local success=$1 action=$2 message=${3:-""}
  cat <<EOF
{
  "script": "${SCRIPT_NAME}",
  "action": "${action}",
  "service": "${SERVICE}",
  "success": ${success},
  "lock_file": "${LOCK_FILE}",
  "locked_by": "${TASK_ID}",
  "locked_at": "${TIMESTAMP}",
  "expires_at": "${EXPIRES_AT}",
  "pid": $$,
  "message": "${message}"
}
EOF
}

case "$ACTION" in
  acquire)
    # Проверяем не устаревшую ли блокировку
    if [[ -f "$LOCK_FILE" ]]; then
      LOCK_PID=$(python3 -c "import json,sys; d=json.load(open('${LOCK_FILE}')); print(d.get('pid',0))" 2>/dev/null || echo 0)
      if [[ "$LOCK_PID" -gt 0 ]] && kill -0 "$LOCK_PID" 2>/dev/null; then
        OWNER=$(python3 -c "import json,sys; d=json.load(open('${LOCK_FILE}')); print(d.get('locked_by','unknown'))" 2>/dev/null || echo "unknown")
        echo 1>&2 "Сервис ${SERVICE} заблокирован задачей ${OWNER} (PID ${LOCK_PID})"
        output_json "false" "acquire" "Сервис занят задачей ${OWNER}"
        exit 1
      else
        echo 1>&2 "Найдена устаревшая блокировка — освобождаю"
        rm -f "$LOCK_FILE"
      fi
    fi

    # Создаём блокировку атомарно через flock
    (
      flock -n 200 || { output_json "false" "acquire" "Не удалось захватить flock"; exit 1; }
      cat > "$LOCK_FILE" <<LOCK_EOF
{
  "service": "${SERVICE}",
  "locked_by": "${TASK_ID}",
  "agent_role": "coder",
  "locked_at": "${TIMESTAMP}",
  "expires_at": "${EXPIRES_AT}",
  "pid": $$
}
LOCK_EOF
    ) 200>"${LOCK_FILE}.flock"

    echo 1>&2 "Блокировка захвачена: ${SERVICE} → ${TASK_ID}"
    output_json "true" "acquire" "Блокировка успешно захвачена"
    ;;

  release)
    if [[ ! -f "$LOCK_FILE" ]]; then
      output_json "true" "release" "Блокировка не существовала"
      exit 0
    fi

    OWNER=$(python3 -c "import json,sys; d=json.load(open('${LOCK_FILE}')); print(d.get('locked_by',''))" 2>/dev/null || echo "")
    if [[ -n "$TASK_ID" && "$OWNER" != "$TASK_ID" ]]; then
      output_json "false" "release" "Нельзя освободить чужую блокировку (владелец: ${OWNER})"
      exit 1
    fi

    rm -f "$LOCK_FILE" "${LOCK_FILE}.flock"
    echo 1>&2 "Блокировка освобождена: ${SERVICE}"
    output_json "true" "release" "Блокировка успешно освобождена"
    ;;

  check)
    if [[ ! -f "$LOCK_FILE" ]]; then
      echo '{"script":"'${SCRIPT_NAME}'","action":"check","service":"'${SERVICE}'","locked":false,"success":true}'
      exit 0
    fi

    LOCK_CONTENT=$(cat "$LOCK_FILE")
    LOCK_PID=$(echo "$LOCK_CONTENT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('pid',0))" 2>/dev/null || echo 0)

    if [[ "$LOCK_PID" -gt 0 ]] && kill -0 "$LOCK_PID" 2>/dev/null; then
      echo '{"script":"'${SCRIPT_NAME}'","action":"check","service":"'${SERVICE}'","locked":true,"lock":'${LOCK_CONTENT}',"success":true}'
    else
      echo 1>&2 "Обнаружена устаревшая блокировка (PID ${LOCK_PID} не существует)"
      echo '{"script":"'${SCRIPT_NAME}'","action":"check","service":"'${SERVICE}'","locked":false,"stale":true,"success":true}'
    fi
    ;;

  *)
    echo '{"success":false,"error":"Неизвестное действие: '"$ACTION"'. Используй: acquire, release, check"}' >&1
    exit 1
    ;;
esac
