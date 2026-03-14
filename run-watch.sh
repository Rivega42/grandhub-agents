#!/usr/bin/env bash
TOKEN=$(cat /root/.openclaw/openclaw.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('gateway',{}).get('auth',{}).get('token',''))")
export OPENROUTER_API_KEY=$TOKEN
export OPENROUTER_BASE_URL=http://localhost:18789
export GITHUB_TOKEN=${GITHUB_TOKEN:-$GITHUB_TOKEN}
export TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN
export TELEGRAM_CHAT_ID=357896330
export GRANDHUB_ROOT=/opt/grandhub-v3
export TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}'
export GHA_HEALTH_PORT=9090
cd /opt/grandhub-agents
echo "[watch] GHA Orchestrator starting in --watch mode" >&2
exec node_modules/.bin/ts-node agents/orchestrator.ts --watch
