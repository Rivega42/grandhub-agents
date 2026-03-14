#!/usr/bin/env bash
# Загружаем переменные из .env (без хардкодированных секретов)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${SCRIPT_DIR}/.env"
  set +a
fi

# OpenClaw token — динамически, не хранится в файлах
TOKEN=$(python3 -c "import json; d=json.load(open('/root/.openclaw/openclaw.json')); print(d.get('gateway',{}).get('auth',{}).get('token',''))")
export OPENROUTER_API_KEY=$TOKEN
export TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}'

cd "${SCRIPT_DIR}"
echo "[watch] GHA Orchestrator starting (--watch mode)" >&2
exec node_modules/.bin/ts-node agents/orchestrator.ts --watch
