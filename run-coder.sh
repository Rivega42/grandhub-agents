#!/usr/bin/env bash
export OPENROUTER_API_KEY=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
export GRANDHUB_ROOT=/opt/grandhub-v3
export TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}'
cd /opt/grandhub-agents
exec node_modules/.bin/ts-node agents/coder.ts "$@"
