#!/usr/bin/env bash
TOKEN=$(cat /root/.openclaw/openclaw.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('gateway',{}).get('auth',{}).get('token',''))")
export OPENROUTER_API_KEY=$TOKEN
export OPENROUTER_BASE_URL=http://localhost:18789
export GITHUB_TOKEN=${GITHUB_TOKEN}
export TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN
export TELEGRAM_CHAT_ID=357896330
export GRANDHUB_ROOT=/opt/grandhub-v3
export TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}'
cd /opt/grandhub-agents
INTERVAL=${WATCH_INTERVAL:-300}
echo "[watch] GHA Watch started" >&2
while true; do
  echo "[watch] $(date '+%H:%M:%S') tick" >&2
  node_modules/.bin/ts-node agents/issues-to-tasks.ts 2>&1 | grep 'issues' || true
  node_modules/.bin/ts-node agents/orchestrator.ts 2>&1 || true
  echo "[watch] sleep ${INTERVAL}s" >&2
  sleep $INTERVAL
done
