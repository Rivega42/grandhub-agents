# AGENTS.md — Правила GHA

## NEVER_DO (жёсткие запреты)

- Никогда не коммитить код без прохождения lint + typecheck
- Никогда не менять queue.json вручную пока оркестратор запущен
- Никогда не удалять файлы из .agent-state/ — только архивировать
- Никогда не трогать coder.ts / reviewer.ts без явного task_id с типом infra
- Никогда не запускать rm -rf без тройного подтверждения
- Никогда не хардкодить секреты — только через process.env
- Никогда не делать DB-запросы внутри циклов (N+1)
- Никогда не игнорировать TypeScript ошибки через @ts-ignore без комментария

## ALWAYS_DO

- После каждого изменения: lint → typecheck → тест
- Каждый инцидент → новое правило в этот файл
- Каждая новая фича → минимум 1 тест на happy path
- Сложные задачи (description > 500 символов) → use_v2_orchestrator: true

## Архитектурные принципы

- Database as Source of Truth — queue.json + .agent-state/ файлы первичны
- Один файл — одна ответственность (coder, reviewer, orchestrator, llm-planner)
- Graceful shutdown: SIGTERM → пауза очереди → ждём завершения → выход
- DLQ: неудачные задачи не теряются — попадают в dlq.json

## Инциденты → правила

- 2026-03-14: coder путал grandhub-v3 и grandhub-agents → правило: service=grandhub-agents → serviceDir=/opt/grandhub-agents
- 2026-03-14: GH29 провалился 3 раза — слишком большая задача → правило: большие задачи дробить через orchestrator-v2
- 2026-03-14: running задачи зависали при рестарте → правило: watchMode() сбрасывает running→pending при старте
