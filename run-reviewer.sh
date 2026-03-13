#!/usr/bin/env bash
export OPENROUTER_API_KEY=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
export GRANDHUB_ROOT=/opt/grandhub-v3
export TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}'
cd /opt/grandhub-agents
exec node_modules/.bin/ts-node agents/reviewer.ts "$@"
