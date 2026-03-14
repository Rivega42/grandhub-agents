# GrandHub Agents (GHA)

Автономная система AI-агентов для разработки GrandHub.

## Архитектура

```
GitHub Issues → issues-to-tasks → queue.json
                                       ↓
                               orchestrator.ts
                                       ↓
                                  coder.ts (LLM через OpenClaw)
                                       ↓
                    lint → typecheck → test → commit
                                       ↓
                                 reviewer.ts
                                       ↓
                           Telegram уведомление
```

## Запуск

```bash
# Продакшн watch (каждые 5 минут)
nohup ./run-watch.sh > /var/log/gha-watch.log 2>&1 &

# Разовые запуски
./run-issues.sh --dry-run          # посмотреть новые issues
./run-issues.sh                    # добавить в очередь
./run-orchestrator.sh              # обработать очередь
./run-coder.sh --task-file <path>  # запустить одну задачу
./run-reviewer.sh --task-id <id>   # ревью задачи
```

## TaskSpec пример

```json
{
  "task_id": "TASK-20260314-001",
  "title": "fix(api-gateway): ...",
  "service": "api-gateway",
  "type": "fix",
  "file_scope": ["src/app.ts"],
  "acceptance_criteria": ["typecheck OK", "lint OK"],
  "allow_test_failure": true,
  "max_retries": 3
}
```

## Переменные окружения

| Переменная | Описание |
|---|---|
| `OPENROUTER_API_KEY` | Gateway token из openclaw.json |
| `OPENROUTER_BASE_URL` | `http://localhost:18789` (OpenClaw) |
| `GITHUB_TOKEN` | Для чтения issues |
| `TELEGRAM_BOT_TOKEN` | Для уведомлений |
| `TELEGRAM_CHAT_ID` | Куда слать уведомления |
| `GRANDHUB_ROOT` | Путь к monorepo |

## Состояние

- `queue.json` — очередь задач
- `.agent-state/` — checkpoint, spec, review, escalation
- `.agent-logs/` — JSONL аудит-лог
