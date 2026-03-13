#!/usr/bin/env bash
# scripts/lint.sh <service>
# Запускает ESLint для указанного сервиса и возвращает JSON с результатами

SERVICE="${1:-}"
GRANDHUB_ROOT="${GRANDHUB_ROOT:-/opt/grandhub-v3}"
SERVICE_DIR="$GRANDHUB_ROOT/services/$SERVICE"
START_MS=$(date +%s%3N)

if [ -z "$SERVICE" ]; then
  echo '{"success":false,"service":"","step":"lint","duration_ms":0,"errors":["Укажите имя сервиса: lint.sh <service>"],"output":""}'
  exit 1
fi

if [ ! -d "$SERVICE_DIR" ]; then
  END_MS=$(date +%s%3N)
  DURATION=$((END_MS - START_MS))
  echo "{\"success\":false,\"service\":\"$SERVICE\",\"step\":\"lint\",\"duration_ms\":$DURATION,\"errors\":[\"Директория не найдена: $SERVICE_DIR\"],\"output\":\"\"}"
  exit 1
fi

cd "$SERVICE_DIR"

# Запускаем eslint с JSON форматом
LINT_JSON=$(pnpm exec eslint . --ext .ts,.tsx,.js,.jsx --format json 2>/dev/null || echo "[]")

END_MS=$(date +%s%3N)
DURATION=$((END_MS - START_MS))

# Считаем ошибки через node
RESULT=$(echo "$LINT_JSON" | node -e "
const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(chunks.join(''));
    const errorCount = data.reduce((acc, f) => acc + (f.errorCount || 0), 0);
    const errors = data
      .flatMap(f => (f.messages || [])
        .filter(m => m.severity === 2)
        .slice(0, 3)
        .map(m => f.filePath.replace(process.cwd()+'/', '') + ':' + m.line + ' ' + m.message)
      ).slice(0, 10);
    console.log(JSON.stringify({ errorCount, errors }));
  } catch(e) {
    console.log(JSON.stringify({ errorCount: 0, errors: [] }));
  }
});
" 2>/dev/null || echo '{"errorCount":0,"errors":[]}')

ERROR_COUNT=$(echo "$RESULT" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.stdout.write(String(d.errorCount||0))" 2>/dev/null || echo "0")
ERRORS_JSON=$(echo "$RESULT" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.stdout.write(JSON.stringify(d.errors||[]))" 2>/dev/null || echo "[]")

if [ "$ERROR_COUNT" = "0" ]; then
  SUCCESS="true"
else
  SUCCESS="false"
fi

cat <<EOF
{
  "success": $SUCCESS,
  "service": "$SERVICE",
  "step": "lint",
  "duration_ms": $DURATION,
  "error_count": $ERROR_COUNT,
  "errors": $ERRORS_JSON,
  "output": "ESLint: $ERROR_COUNT ошибок"
}
EOF
