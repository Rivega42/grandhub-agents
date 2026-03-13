#!/bin/bash
# context-assemble.sh — сборка контекста для Coder агента с подсчётом токенов
# Загружает AGENT.md сервиса + файлы из file_scope TaskSpec
# Лимит контекста: 30K токенов (предупреждение при >28K)
# Использование: context-assemble.sh --service <name> --task-id <id> --task-file <path>

set -euo pipefail

SERVICE=""
TASK_ID=""
TASK_FILE=""
OUTPUT_DIR=".agent-state"
SCRIPT_NAME="context-assemble.sh"
MAX_TOKENS=28000
REPO_ROOT="/opt/grandhub-v3"

while [[ $# -gt 0 ]]; do
  case $1 in
    --service) SERVICE="$2"; shift 2 ;;
    --task-id) TASK_ID="$2"; shift 2 ;;
    --task-file) TASK_FILE="$2"; shift 2 ;;
    --repo-root) REPO_ROOT="$2"; shift 2 ;;
    --help) echo "Usage: context-assemble.sh --service <name> --task-id <id> --task-file <path>"; exit 0 ;;
    *) shift ;;
  esac
done

# Валидация
for arg in SERVICE TASK_ID TASK_FILE; do
  if [[ -z "${!arg}" ]]; then
    echo "{\"success\":false,\"error\":\"--${arg,,} обязателен\"}" >&1
    exit 1
  fi
done

if [[ ! -f "$TASK_FILE" ]]; then
  echo "{\"success\":false,\"error\":\"TaskSpec файл не найден: ${TASK_FILE}\"}" >&1
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
CONTEXT_FILE="${OUTPUT_DIR}/${TASK_ID}-context.md"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Функция: примерный подсчёт токенов (1 токен ≈ 4 символа)
count_tokens() {
  local text="$1"
  echo $((${#text} / 4))
}

echo 1>&2 "Сборка контекста для ${SERVICE} / ${TASK_ID}..."

# Инициализируем контекст
CONTEXT=""
FILES_LOADED=()
TOTAL_TOKENS=0

# 1. Системный промпт (фиксированные ~2000 токенов)
SYSTEM_SECTION="# СИСТЕМНЫЙ КОНТЕКСТ
Ты — Coder агент GrandHub. Твоя задача: реализовать код строго по TaskSpec.
Работай только в пределах file_scope. Запускай eval-loop.sh после каждого изменения.
"
CONTEXT+="$SYSTEM_SECTION"
TOTAL_TOKENS=$((TOTAL_TOKENS + 500))

# 2. TaskSpec (~1000 токенов)
TASK_CONTENT=$(cat "$TASK_FILE")
CONTEXT+="\n# TASK SPEC\n${TASK_CONTENT}\n"
TASK_TOKENS=$(count_tokens "$TASK_CONTENT")
TOTAL_TOKENS=$((TOTAL_TOKENS + TASK_TOKENS))
echo 1>&2 "TaskSpec: ~${TASK_TOKENS} токенов"

# 3. AGENT.md сервиса (~1500 токенов)
AGENT_MD="${REPO_ROOT}/services/${SERVICE}/AGENT.md"
if [[ -f "$AGENT_MD" ]]; then
  AGENT_CONTENT=$(cat "$AGENT_MD")
  CONTEXT+="\n# AGENT.md — ${SERVICE}\n${AGENT_CONTENT}\n"
  AGENT_TOKENS=$(count_tokens "$AGENT_CONTENT")
  TOTAL_TOKENS=$((TOTAL_TOKENS + AGENT_TOKENS))
  FILES_LOADED+=("AGENT.md")
  echo 1>&2 "AGENT.md: ~${AGENT_TOKENS} токенов"
else
  echo 1>&2 "⚠️  AGENT.md не найден для ${SERVICE}: ${AGENT_MD}"
  CONTEXT+="\n# AGENT.md — ${SERVICE}\n⚠️ AGENT.md отсутствует. Изучи код самостоятельно.\n"
fi

# 4. Файлы из file_scope TaskSpec
FILE_SCOPE=$(python3 -c "
import json, sys
try:
    d = json.load(open('${TASK_FILE}'))
    files = d.get('file_scope', [])
    print('\n'.join(files))
except Exception as e:
    print('', end='')
" 2>/dev/null)

REMAINING_TOKENS=$((MAX_TOKENS - TOTAL_TOKENS))
echo 1>&2 "Осталось токенов для файлов: ~${REMAINING_TOKENS}"

while IFS= read -r rel_file; do
  [[ -z "$rel_file" ]] && continue

  # Ищем файл относительно сервиса или репо
  FULL_PATH="${REPO_ROOT}/services/${SERVICE}/${rel_file}"
  [[ ! -f "$FULL_PATH" ]] && FULL_PATH="${REPO_ROOT}/${rel_file}"
  [[ ! -f "$FULL_PATH" ]] && FULL_PATH="${rel_file}"

  if [[ -f "$FULL_PATH" ]]; then
    FILE_CONTENT=$(cat "$FULL_PATH")
    FILE_TOKENS=$(count_tokens "$FILE_CONTENT")

    if [[ $((TOTAL_TOKENS + FILE_TOKENS)) -gt $MAX_TOKENS ]]; then
      echo 1>&2 "⚠️  Пропускаю ${rel_file} (превысит лимит: +${FILE_TOKENS} токенов)"
      continue
    fi

    CONTEXT+="\n# ФАЙЛ: ${rel_file}\n\`\`\`typescript\n${FILE_CONTENT}\n\`\`\`\n"
    TOTAL_TOKENS=$((TOTAL_TOKENS + FILE_TOKENS))
    FILES_LOADED+=("$rel_file")
    echo 1>&2 "Загружен ${rel_file}: ~${FILE_TOKENS} токенов (итого: ~${TOTAL_TOKENS})"
  else
    echo 1>&2 "⚠️  Файл не найден: ${rel_file} (будет создан агентом)"
    CONTEXT+="\n# ФАЙЛ: ${rel_file}\n[Файл не существует — нужно создать]\n"
    FILES_LOADED+=("${rel_file} (новый)")
  fi
done <<< "$FILE_SCOPE"

# Сохраняем контекст
printf '%s' "$CONTEXT" > "$CONTEXT_FILE"

# Предупреждение если близко к лимиту
WARNING=""
if [[ $TOTAL_TOKENS -gt $MAX_TOKENS ]]; then
  WARNING="ПРЕВЫШЕН ЛИМИТ ТОКЕНОВ"
  echo 1>&2 "🔴 ${WARNING}: ${TOTAL_TOKENS} > ${MAX_TOKENS}"
elif [[ $TOTAL_TOKENS -gt 25000 ]]; then
  WARNING="близко к лимиту"
  echo 1>&2 "🟡 Внимание: ${TOTAL_TOKENS} токенов (лимит ${MAX_TOKENS})"
fi

FILES_JSON=$(python3 -c "import json; print(json.dumps(${FILES_LOADED[@]@Q} if False else $(printf '%s\n' "${FILES_LOADED[@]}" | python3 -c 'import json,sys; print(json.dumps([l.strip() for l in sys.stdin]))'))" 2>/dev/null || echo '[]')

cat <<EOF
{
  "script": "${SCRIPT_NAME}",
  "service": "${SERVICE}",
  "task_id": "${TASK_ID}",
  "files_loaded": ${FILES_JSON},
  "total_tokens": ${TOTAL_TOKENS},
  "max_tokens": ${MAX_TOKENS},
  "context_file": "${CONTEXT_FILE}",
  "warning": "${WARNING}",
  "success": true,
  "timestamp": "${TIMESTAMP}"
}
EOF
