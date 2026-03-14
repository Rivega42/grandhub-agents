#!/usr/bin/env bash
export OPENROUTER_API_KEY=fc699a60dc21c0213fc7cc0f1c7efcf614e12731ec8621e3
export OPENROUTER_BASE_URL=http://localhost:18789
export TELEGRAM_BOT_TOKEN=5415945042:AAG6dps5ed-YZmdJe_s-342xAEoOrNA1NhY
export TELEGRAM_CHAT_ID=357896330
export GRANDHUB_ROOT=/opt/grandhub-v3
export TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}'
cd /opt/grandhub-agents
exec node_modules/.bin/ts-node agents/orchestrator.ts "$@"
