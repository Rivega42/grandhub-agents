#!/usr/bin/env bash
# scripts/checkpoint-save.sh <task_id>
# Сохраняет текущее состояние задачи в JSON файл
# Позволяет агенту продолжить с того же места при прерывании

set -euo pipefail

TASK_ID="${1:-}"
CHECKPOINT_DIR="${CHECKPOINT_DIR:-/tmp/grandhub-checkpoints}"
START_MS=$(date +%s%3N)

if [ -z "$TASK_ID" ]; then
  echo '{"success":false,"step":"checkpoint-save","duration_ms":0,"errors":["Укажите task_id: checkpoint-save.sh <task_id>"],"output":""}'
  exit 1
fi

mkdir -p "$CHECKPOINT_DIR"

CHECKPOINT_FILE="$CHECKPOINT_DIR/${TASK_ID}.json"

# Собираем состояние окружения
GRANDHUB_ROOT="${GRANDHUB_ROOT:-/opt/grandhub-v3}"
GIT_COMMIT=$(git -C "$GRANDHUB_ROOT" rev-parse HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git -C "$GRANDHUB_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Читаем stdin если передали данные
if [ -t 0 ]; then
  # Нет данных в stdin — создаём базовый checkpoint
  CHECKPOINT_DATA="{}"
else
  CHECKPOINT_DATA=$(cat /dev/stdin 2>/dev/null || echo "{}")
fi

# Валидируем JSON
IS_VALID_JSON=$(echo "$CHECKPOINT_DATA" | node -e "
try {
  JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log('true');
} catch(e) {
  console.log('false');
}" 2>/dev/null || echo "false")

if [ "$IS_VALID_JSON" = "false" ]; then
  # Упаковываем как строку
  SAFE_DATA=$(echo "$CHECKPOINT_DATA" | sed 's/\\/\\\\/g; s/"/\\"/g; s/$/\\n/' | tr -d '\n')
  CHECKPOINT_DATA="{\"raw\":\"$SAFE_DATA\"}"
fi

# Обогащаем checkpoint метаданными
ENRICHED=$(echo "$CHECKPOINT_DATA" | node -e "
const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
const enriched = {
  task_id: '$TASK_ID',
  timestamp: '$TIMESTAMP',
  git_commit: '$GIT_COMMIT',
  git_branch: '$GIT_BRANCH',
  grandhub_root: '$GRANDHUB_ROOT',
  ...data
};
console.log(JSON.stringify(enriched, null, 2));
" 2>/dev/null || echo "{\"task_id\":\"$TASK_ID\",\"timestamp\":\"$TIMESTAMP\",\"git_commit\":\"$GIT_COMMIT\"}")

# Сохраняем
echo "$ENRICHED" > "$CHECKPOINT_FILE"

END_MS=$(date +%s%3N)
DURATION=$((END_MS - START_MS))

cat <<EOF
{
  "success": true,
  "task_id": "$TASK_ID",
  "step": "checkpoint-save",
  "duration_ms": $DURATION,
  "checkpoint_file": "$CHECKPOINT_FILE",
  "git_commit": "$GIT_COMMIT",
  "timestamp": "$TIMESTAMP",
  "errors": [],
  "output": "Checkpoint сохранён: $CHECKPOINT_FILE"
}
EOF
