#!/usr/bin/env bash
# scripts/eval-loop.sh <service>
# Полный цикл проверки: lint → typecheck → test → build
# Fail-fast: при ошибке на любом шаге останавливается
# Возвращает итоговый JSON

set -euo pipefail

SERVICE="${1:-}"
GRANDHUB_ROOT="${GRANDHUB_ROOT:-/opt/grandhub-v3}"
SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
START_MS=$(date +%s%3N)

if [ -z "$SERVICE" ]; then
  echo '{"success":false,"service":"","step":"eval-loop","duration_ms":0,"errors":["Укажите имя сервиса: eval-loop.sh <service>"],"steps":{},"output":""}'
  exit 1
fi

echo "🔄 Запуск Eval Loop для сервиса: $SERVICE" >&2
echo "📂 Монорепо: $GRANDHUB_ROOT" >&2
echo "" >&2

RESULTS="{}"
OVERALL_SUCCESS=true
FAILED_STEP=""

# Функция запуска шага
run_step() {
  local STEP="$1"
  local SCRIPT="$2"
  
  echo "▶ Шаг: $STEP..." >&2
  
  local STEP_OUTPUT
  STEP_OUTPUT=$("$SCRIPT" "$SERVICE" 2>/dev/null)
  local STEP_SUCCESS
  STEP_SUCCESS=$(echo "$STEP_OUTPUT" | node -e "
try {
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log(d.success ? 'true' : 'false');
} catch(e) { console.log('false'); }
" 2>/dev/null || echo "false")
  
  if [ "$STEP_SUCCESS" = "true" ]; then
    echo "  ✅ $STEP — OK" >&2
  else
    echo "  ❌ $STEP — FAILED" >&2
    OVERALL_SUCCESS=false
    FAILED_STEP="$STEP"
    
    # Показываем ошибки
    echo "$STEP_OUTPUT" | node -e "
try {
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  if (d.errors && d.errors.length > 0) {
    d.errors.slice(0,5).forEach(e => console.error('  →', e));
  }
} catch(e) {}
" >&2 2>/dev/null || true
  fi
  
  echo "$STEP_OUTPUT"
}

# Запускаем шаги последовательно с fail-fast
LINT_RESULT=$(run_step "lint" "$SCRIPTS_DIR/lint.sh")
LINT_OK=$(echo "$LINT_RESULT" | node -e "try{const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.success?'true':'false')}catch(e){console.log('false')}" 2>/dev/null || echo "false")

if [ "$LINT_OK" != "true" ]; then
  END_MS=$(date +%s%3N)
  DURATION=$((END_MS - START_MS))
  echo "" >&2
  echo "❌ Eval Loop завершён с ошибкой на шаге: lint" >&2
  echo "{\"success\":false,\"service\":\"$SERVICE\",\"step\":\"eval-loop\",\"failed_at\":\"lint\",\"duration_ms\":$DURATION,\"errors\":[\"Провал на шаге lint — см. details\"],\"details\":{\"lint\":$LINT_RESULT,\"typecheck\":null,\"test\":null,\"build\":null}}"
  exit 1
fi

TYPECHECK_RESULT=$(run_step "typecheck" "$SCRIPTS_DIR/typecheck.sh")
TYPECHECK_OK=$(echo "$TYPECHECK_RESULT" | node -e "try{const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.success?'true':'false')}catch(e){console.log('false')}" 2>/dev/null || echo "false")

if [ "$TYPECHECK_OK" != "true" ]; then
  END_MS=$(date +%s%3N)
  DURATION=$((END_MS - START_MS))
  echo "" >&2
  echo "❌ Eval Loop завершён с ошибкой на шаге: typecheck" >&2
  echo "{\"success\":false,\"service\":\"$SERVICE\",\"step\":\"eval-loop\",\"failed_at\":\"typecheck\",\"duration_ms\":$DURATION,\"errors\":[\"Провал на шаге typecheck — см. details\"],\"details\":{\"lint\":$LINT_RESULT,\"typecheck\":$TYPECHECK_RESULT,\"test\":null,\"build\":null}}"
  exit 1
fi

TEST_RESULT=$(run_step "test" "$SCRIPTS_DIR/test.sh")
TEST_OK=$(echo "$TEST_RESULT" | node -e "try{const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.success?'true':'false')}catch(e){console.log('false')}" 2>/dev/null || echo "false")

if [ "$TEST_OK" != "true" ]; then
  END_MS=$(date +%s%3N)
  DURATION=$((END_MS - START_MS))
  echo "" >&2
  echo "❌ Eval Loop завершён с ошибкой на шаге: test" >&2
  echo "{\"success\":false,\"service\":\"$SERVICE\",\"step\":\"eval-loop\",\"failed_at\":\"test\",\"duration_ms\":$DURATION,\"errors\":[\"Провал на шаге test — см. details\"],\"details\":{\"lint\":$LINT_RESULT,\"typecheck\":$TYPECHECK_RESULT,\"test\":$TEST_RESULT,\"build\":null}}"
  exit 1
fi

BUILD_RESULT=$(run_step "build" "$SCRIPTS_DIR/build.sh")
BUILD_OK=$(echo "$BUILD_RESULT" | node -e "try{const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.success?'true':'false')}catch(e){console.log('false')}" 2>/dev/null || echo "false")

END_MS=$(date +%s%3N)
DURATION=$((END_MS - START_MS))

echo "" >&2

if [ "$BUILD_OK" = "true" ]; then
  echo "✅ Eval Loop завершён успешно! Время: ${DURATION}ms" >&2
  echo "{\"success\":true,\"service\":\"$SERVICE\",\"step\":\"eval-loop\",\"duration_ms\":$DURATION,\"errors\":[],\"details\":{\"lint\":$LINT_RESULT,\"typecheck\":$TYPECHECK_RESULT,\"test\":$TEST_RESULT,\"build\":$BUILD_RESULT}}"
else
  echo "❌ Eval Loop завершён с ошибкой на шаге: build" >&2
  echo "{\"success\":false,\"service\":\"$SERVICE\",\"step\":\"eval-loop\",\"failed_at\":\"build\",\"duration_ms\":$DURATION,\"errors\":[\"Провал на шаге build — см. details\"],\"details\":{\"lint\":$LINT_RESULT,\"typecheck\":$TYPECHECK_RESULT,\"test\":$TEST_RESULT,\"build\":$BUILD_RESULT}}"
  exit 1
fi
