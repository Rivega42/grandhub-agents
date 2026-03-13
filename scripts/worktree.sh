#!/usr/bin/env bash
# scripts/worktree.sh — управление git worktree для изоляции задач агентов
# Каждая задача работает в своём worktree, никогда не трогает main напрямую
# Использование: worktree.sh <create|remove|list|status> [--task-id <id>] [--repo <path>]

set -euo pipefail

ACTION="${1:-}"
TASK_ID=""
REPO_ROOT="${GRANDHUB_ROOT:-/opt/grandhub-v3}"
WORKTREES_DIR="${REPO_ROOT}/worktrees"
SCRIPT_NAME="worktree.sh"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

shift || true
while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id)  TASK_ID="$2"; shift 2 ;;
    --repo)     REPO_ROOT="$2"; WORKTREES_DIR="${REPO_ROOT}/worktrees"; shift 2 ;;
    --help)     echo "Usage: worktree.sh <create|remove|list|status> --task-id <id>"; exit 0 ;;
    *)          shift ;;
  esac
done

BRANCH_NAME="agent/${TASK_ID}"
WORKTREE_PATH="${WORKTREES_DIR}/${TASK_ID}"

case "$ACTION" in
  create)
    [[ -z "$TASK_ID" ]] && { echo '{"success":false,"error":"--task-id обязателен"}'; exit 1; }

    if [[ -d "$WORKTREE_PATH" ]]; then
      echo 1>&2 "Worktree уже существует: ${WORKTREE_PATH}"
      echo "{\"script\":\"${SCRIPT_NAME}\",\"action\":\"create\",\"task_id\":\"${TASK_ID}\",\"worktree_path\":\"${WORKTREE_PATH}\",\"branch\":\"${BRANCH_NAME}\",\"success\":true,\"already_exists\":true}"
      exit 0
    fi

    mkdir -p "$WORKTREES_DIR"

    echo 1>&2 "Создаю worktree: ${WORKTREE_PATH} (ветка: ${BRANCH_NAME})"
    cd "$REPO_ROOT"
    git worktree add "$WORKTREE_PATH" -b "$BRANCH_NAME" main 2>&1 >&2

    echo "{\"script\":\"${SCRIPT_NAME}\",\"action\":\"create\",\"task_id\":\"${TASK_ID}\",\"worktree_path\":\"${WORKTREE_PATH}\",\"branch\":\"${BRANCH_NAME}\",\"success\":true,\"timestamp\":\"${TIMESTAMP}\"}"
    ;;

  remove)
    [[ -z "$TASK_ID" ]] && { echo '{"success":false,"error":"--task-id обязателен"}'; exit 1; }

    if [[ ! -d "$WORKTREE_PATH" ]]; then
      echo "{\"script\":\"${SCRIPT_NAME}\",\"action\":\"remove\",\"task_id\":\"${TASK_ID}\",\"success\":true,\"note\":\"worktree не существовал\"}"
      exit 0
    fi

    echo 1>&2 "Удаляю worktree: ${WORKTREE_PATH}"
    cd "$REPO_ROOT"
    git worktree remove "$WORKTREE_PATH" --force 2>&1 >&2 || rm -rf "$WORKTREE_PATH"
    git branch -d "$BRANCH_NAME" 2>&1 >&2 || true

    echo "{\"script\":\"${SCRIPT_NAME}\",\"action\":\"remove\",\"task_id\":\"${TASK_ID}\",\"worktree_path\":\"${WORKTREE_PATH}\",\"success\":true,\"timestamp\":\"${TIMESTAMP}\"}"
    ;;

  list)
    cd "$REPO_ROOT"
    WORKTREES=$(git worktree list --porcelain 2>/dev/null | grep -E '^worktree|^branch' | paste - - | \
      awk '{print "{\"path\":\""$2"\",\"branch\":\""$4"\"}"}' | \
      python3 -c "import sys,json; lines=sys.stdin.readlines(); print(json.dumps([json.loads(l.strip()) for l in lines if l.strip()]))" 2>/dev/null || echo '[]')

    echo "{\"script\":\"${SCRIPT_NAME}\",\"action\":\"list\",\"worktrees\":${WORKTREES},\"success\":true}"
    ;;

  status)
    [[ -z "$TASK_ID" ]] && { echo '{"success":false,"error":"--task-id обязателен"}'; exit 1; }

    EXISTS="false"
    [[ -d "$WORKTREE_PATH" ]] && EXISTS="true"

    echo "{\"script\":\"${SCRIPT_NAME}\",\"action\":\"status\",\"task_id\":\"${TASK_ID}\",\"worktree_path\":\"${WORKTREE_PATH}\",\"exists\":${EXISTS},\"branch\":\"${BRANCH_NAME}\",\"success\":true}"
    ;;

  *)
    echo "{\"success\":false,\"error\":\"Неизвестное действие: ${ACTION}. Используй: create, remove, list, status\"}"
    exit 1
    ;;
esac
