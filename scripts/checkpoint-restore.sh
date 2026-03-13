#!/usr/bin/env bash
# scripts/checkpoint-restore.sh <task_id>
# Восстанавливает состояние задачи из JSON файла checkpoint
# Возвращает сохранённые данные в JSON

set -euo pipefail

TASK_ID="${1:-}"
CHECKPOINT_DIR="${CHECKPOINT_DIR:-/tmp/grandhub-checkpoints}"
START_MS=$(date +%s%3N)

if [ -z "$TASK_ID" ]; then
  echo '{"success":false,"step":"checkpoint-restore","duration_ms":0,"errors":["Укажите task_id: checkpoint-restore.sh <task_id>"],"checkpoint":null,"output":""}'
  exit 1
fi

CHECKPOINT_FILE="$CHECKPOINT_DIR/${TASK_ID}.json"

if [ ! -f "$CHECKPOINT_FILE" ]; then
  # Ищем похожие checkpoint файлы
  SIMILAR=$(ls "$CHECKPOINT_DIR"/*.json 2>/dev/null | head -5 | \
    node -e "
const lines = require('fs').readFileSync('/dev/stdin','utf8').trim().split('\n').filter(Boolean);
console.log(JSON.stringify(lines));
" 2>/dev/null || echo "[]")
  
  END_MS=$(date +%s%3N)
  DURATION=$((END_MS - START_MS))
  echo "{\"success\":false,\"task_id\":\"$TASK_ID\",\"step\":\"checkpoint-restore\",\"duration_ms\":$DURATION,\"errors\":[\"Checkpoint не найден: $CHECKPOINT_FILE\"],\"available_checkpoints\":$SIMILAR,\"checkpoint\":null,\"output\":\"\"}"
  exit 1
fi

# Читаем checkpoint
CHECKPOINT_DATA=$(cat "$CHECKPOINT_FILE")

# Проверяем давность checkpoint
CHECKPOINT_TIME=$(echo "$CHECKPOINT_DATA" | node -e "
try {
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log(d.timestamp || '');
} catch(e) { console.log(''); }
" 2>/dev/null || echo "")

CHECKPOINT_COMMIT=$(echo "$CHECKPOINT_DATA" | node -e "
try {
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log(d.git_commit || 'unknown');
} catch(e) { console.log('unknown'); }
" 2>/dev/null || echo "unknown")

CURRENT_COMMIT=$(git -C "${GRANDHUB_ROOT:-/opt/grandhub-v3}" rev-parse HEAD 2>/dev/null || echo "unknown")

# Предупреждение если коммиты не совпадают
WARNINGS="[]"
if [ "$CHECKPOINT_COMMIT" != "$CURRENT_COMMIT" ] && [ "$CHECKPOINT_COMMIT" != "unknown" ]; then
  WARNINGS="[\"Внимание: checkpoint создан на коммите $CHECKPOINT_COMMIT, текущий коммит $CURRENT_COMMIT. Состояние могло измениться.\"]"
fi

END_MS=$(date +%s%3N)
DURATION=$((END_MS - START_MS))

cat <<EOF
{
  "success": true,
  "task_id": "$TASK_ID",
  "step": "checkpoint-restore",
  "duration_ms": $DURATION,
  "checkpoint_file": "$CHECKPOINT_FILE",
  "checkpoint_commit": "$CHECKPOINT_COMMIT",
  "current_commit": "$CURRENT_COMMIT",
  "warnings": $WARNINGS,
  "errors": [],
  "checkpoint": $CHECKPOINT_DATA,
  "output": "Checkpoint восстановлен: $CHECKPOINT_FILE (создан: $CHECKPOINT_TIME)"
}
EOF
