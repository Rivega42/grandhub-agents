#!/usr/bin/env bash
export OPENROUTER_API_KEY=
export OPENROUTER_BASE_URL=http://localhost:18789
export GITHUB_TOKEN=${GITHUB_TOKEN}
export GRANDHUB_ROOT=/opt/grandhub-v3
export TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}'
cd /opt/grandhub-agents
exec node_modules/.bin/ts-node agents/issues-to-tasks.ts "$@"
