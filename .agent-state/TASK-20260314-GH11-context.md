# СИСТЕМНЫЙ КОНТЕКСТ
Ты — Coder агент GrandHub. Твоя задача: реализовать код строго по TaskSpec.
Работай только в пределах file_scope. Запускай eval-loop.sh после каждого изменения.
\n# TASK SPEC\n{
  "task_id": "TASK-20260314-GH11",
  "title": "feat(assistant-runtime): \u043f\u0440\u0438\u043c\u0435\u043d\u044f\u0442\u044c flowConfig \u0441\u043a\u0438\u043b\u043b\u043e\u0432 \u043f\u0440\u0438 \u0441\u0431\u043e\u0440\u043a\u0435 \u0441\u0438\u0441\u0442\u0435\u043c\u043d\u043e\u0433\u043e \u043f\u0440\u043e\u043c\u043f\u0442\u0430",
  "description": "GitHub Issue #11: feat(assistant-runtime): \u043f\u0440\u0438\u043c\u0435\u043d\u044f\u0442\u044c flowConfig \u0441\u043a\u0438\u043b\u043b\u043e\u0432 \u043f\u0440\u0438 \u0441\u0431\u043e\u0440\u043a\u0435 \u0441\u0438\u0441\u0442\u0435\u043c\u043d\u043e\u0433\u043e \u043f\u0440\u043e\u043c\u043f\u0442\u0430\n\n\u041a\u043e\u0433\u0434\u0430 \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u0430\u043a\u0442\u0438\u0432\u0438\u0440\u0443\u0435\u0442 \u0441\u043a\u0438\u043b\u043b \u0441 flowConfig (\u043d\u0430\u043f\u0440\u0438\u043c\u0435\u0440, Chain of Thought), prompt-builder \u0434\u043e\u043b\u0436\u0435\u043d \u043f\u0440\u0438\u043c\u0435\u043d\u044f\u0442\u044c \u0440\u0435\u0436\u0438\u043c \u043c\u044b\u0448\u043b\u0435\u043d\u0438\u044f.\n\n## \u0421\u0435\u0440\u0432\u0438\u0441\nservices/assistant-runtime/\n\n## \u0424\u0430\u0439\u043b\u044b \u0434\u043b\u044f \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f\n1. services/assistant-runtime/src/services/prompt-builder.ts \u2014 \u0413\u041b\u0410\u0412\u041d\u042b\u0419 \u0444\u0430\u0439\u043b\n2. services/assistant-runtime/src/routes/skills.ts \u2014 API \u0434\u043b\u044f \u0443\u0441\u0442\u0430\u043d\u043e\u0432\u043a\u0438 \u0441\u043a\u0438\u043b\u043b\u043e\u0432\n\n## \u0427\u0442\u043e \u043d\u0443\u0436\u043d\u043e \u0441\u0434\u0435\u043b\u0430\u0442\u044c\n\n### \u0412 prompt-builder.ts\n\n\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0444\u0443\u043d\u043a\u0446\u0438\u044e getActiveFlowSkills() \u043a\u043e\u0442\u043e\u0440\u0430\u044f:\n1. \u041f\u043e\u043b\u0443\u0447\u0430\u0435\u0442 \u0443\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u043d\u044b\u0435 \u0441\u043a\u0438\u043b\u043b\u044b \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044f \u0438\u0437 \u0442\u0430\u0431\u043b\u0438\u0446\u044b sk",
  "service": "assistant-runtime",
  "type": "feat",
  "priority": "medium",
  "file_scope": [
    "src/services/prompt-builder.ts",
    "src/routes/messages.ts"
  ],
  "acceptance_criteria": [
    "\u041f\u0440\u043e\u0431\u043b\u0435\u043c\u0430 \u0438\u0437 issue #11 \u0443\u0441\u0442\u0440\u0430\u043d\u0435\u043d\u0430",
    "typecheck \u043f\u0440\u043e\u0445\u043e\u0434\u0438\u0442 \u0431\u0435\u0437 \u043e\u0448\u0438\u0431\u043e\u043a",
    "lint \u043f\u0440\u043e\u0445\u043e\u0434\u0438\u0442 \u0431\u0435\u0437 \u043e\u0448\u0438\u0431\u043e\u043a"
  ],
  "allow_test_failure": false,
  "max_retries": 3,
  "escalation_threshold": 2,
  "timeout_minutes": 30,
  "cost_budget_usd": 2,
  "created_at": "2026-03-14T12:18:39.515Z",
  "github_issue": {
    "number": 11,
    "url": "https://github.com/Rivega42/grandhub-feedback/issues/11",
    "author": "Rivega42"
  },
  "service_path": "/opt/grandhub-v3/services/assistant-runtime"
}\n\n# AGENT.md — assistant-runtime\n# AGENT.md — assistant-runtime (AI-ассистент)

> Этот файл предназначен для AI-агентов. Прочитай его полностью перед работой с сервисом.

## Назначение

Сервис AI-ассистентов GrandHub. Управляет персональными ассистентами пользователей, обрабатывает сообщения через LLM (Claude), интегрируется с Gmail, Calendar, выполняет напоминания, поддерживает голосовой ввод и мультимодальность. Ключевой сервис платформы.

## Технологии

- **Язык:** TypeScript 5.x
- **Framework:** Express.js
- **LLM:** Anthropic Claude (через `@anthropic-ai/sdk`)
- **Оркестрация LLM:** LangChain + LangGraph
- **БД:** PostgreSQL (через `@grandbazar/database`, Prisma)
- **Тесты:** Vitest
- **Сборка:** tsc -b
- **Планировщик:** node-cron (напоминания)
- **Мультимодальность:** multer (загрузка файлов)

## Точки входа

- `src/index.ts` — запуск сервиса (порт `ASSISTANT_RUNTIME_PORT` или **4005**), инициализация reminderScheduler
- `src/app.ts` — Express приложение
- `src/config/index.ts` — лимиты по планам (FREE/START/PRO/BUSINESS), порт, JWT
- `src/routes/assistants.ts` — CRUD ассистентов
- `src/routes/messages.ts` — отправка/получение сообщений
- `src/routes/simple-messages.ts` — упрощённый чат
- `src/routes/reminders.ts` — напоминания
- `src/routes/calendar.ts` — интеграция с Google Calendar
- `src/routes/gmail.ts` — интеграция с Gmail
- `src/routes/expenses.ts` — учёт расходов
- `src/routes/skills.ts` — навыки ассистента
- `src/routes/search.ts` — веб-поиск
- `src/routes/a2a.ts` — Agent-to-Agent протокол
- `src/agents/` — AI-агенты (LangGraph)
- `src/services/reminder-scheduler.ts` — планировщик напоминаний

## Лимиты по тарифным планам

| Plan | Ассистентов | Сообщений/день | Модель |
|------|------------|---------------|--------|
| FREE | 1 | 50 | claude-haiku-4-5 |
| START | 3 | 200 | claude-haiku-4-5 |
| PRO | 10 | 1000 | claude-sonnet-4-5 |
| BUSINESS | ∞ | ∞ | claude-opus-4-5 |

## Подводные камни

- ⚠️ **`ANTHROPIC_API_KEY`** — обязателен в production. Без него все вызовы LLM упадут
- ⚠️ **`src/app.ts.backup`** и `src/index.ts.backup`** — файлы-backup, НЕ трогать, не удалять
- ⚠️ **reminderScheduler** запускается ПОСЛЕ `run()` в `index.ts` — не трогать порядок
- ⚠️ **LangGraph агенты** в `src/agents/` — сложная логика, минимальные изменения
- ⚠️ **Prisma** — схема в `@grandbazar/database`, не в этом сервисе
- ⚠️ **`createServiceRunner`** из `@grandbazar/shared` — нельзя заменить на простой `listen()`
- ⚠️ **OPENCLAW_PATH** — путь к openclaw CLI для выполнения задач ассистентом
- ⚠️ **multer** для файлов — проверяй size limits при добавлении новых эндпоинтов загрузки

## Как запустить локально

```bash
cd /opt/grandhub-v3/services/assistant-runtime
pnpm dev      # dev режим
pnpm build    # сборка
pnpm start    # production
pnpm test     # vitest run
pnpm typecheck
pnpm lint
```

## Переменные окружения

| Переменная | Описание | Пример | Обязательная |
|-----------|---------|--------|-------------|
| `ASSISTANT_RUNTIME_PORT` | Порт сервиса | `4005` | ✅ |
| `ANTHROPIC_API_KEY` | API ключ Claude | `sk-ant-...` | ✅ |
| `DATABASE_URL` | PostgreSQL URL | `postgresql://...` | ✅ |
| `JWT_SECRET` | JWT секрет | `...` | ✅ |
| `OPENCLAW_PATH` | Путь к openclaw | `/usr/local/bin/openclaw` | ⬜ |
| `OPENCLAW_WORKSPACE_BASE` | Base dir для ассистентов | `/var/lib/grandbazar/assistants` | ⬜ |
| `GOOGLE_CLIENT_ID` | Google OAuth | `...` | ⬜ |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Secret | `...` | ⬜ |
| `NODE_ENV` | Окружение | `production` | ✅ |

## Зависимости от других сервисов

- Зависит от: PostgreSQL, Redis, Anthropic API, Google APIs
- Нужен для: api-gateway (проксирует `/api/assistants/*`), фронтенд\n\n# ФАЙЛ: src/services/prompt-builder.ts\n```typescript\n/**
 * Сборщик system prompt для AI-вызовов.
 * Компоновка из: базовый промпт + персонализация + контекст памяти + навыки.
 */
import { getDbClient } from '@grandbazar/database';
import { getUserPreferences, preferencesToPrompt } from './personalization';

/**
 * Собирает system prompt из:
 * - AssistantConfig (systemPrompt, personality, customInstructions)
 * - AISkills (подключённые AI-навыки)
 * - UserPreferences (персонализация от юзера)
 * - Context (дата, имя юзера)
 * - Tools info (какие инструменты доступны)
 */
export async function buildSystemPrompt(params: {
  assistantId: string;
  userId: string;
  userName?: string;
}): Promise<string> {
  const prisma = getDbClient();
  
  // Получаем конфигурацию помощника
  const assistant = await prisma.assistant.findUnique({
    where: { id: params.assistantId },
    include: {
      assistantConfig: true,
      aiSkills: {
        where: { enabled: true },
        include: {
          skill: true
        }
      }
    }
  });

  if (!assistant) {
    throw new Error('Assistant not found');
  }

  // Получаем персонализацию юзера
  const userPrefs = await getUserPreferences(params.userId);

  const parts: string[] = [];

  // Базовая роль — используем имя из preferences если есть
  const botName = userPrefs?.botName || assistant.assistantConfig?.name || assistant.name;
  parts.push(`Ты — персональный AI-помощник на платформе GrandHub.`);
  parts.push(`Твоё имя: ${botName}`);

  // Personality если есть
  if (assistant.personality) {
    parts.push(`Личность: ${assistant.personality}`);
  }
  if (assistant.assistantConfig?.personality) {
    parts.push(`Дополнительно: ${assistant.assistantConfig.personality}`);
  }

  // Персонализация от юзера
  const prefsPrompt = preferencesToPrompt(userPrefs);
  if (prefsPrompt) {
    parts.push(`\n=== 🎭 ПЕРСОНАЛЬНЫЕ НАСТРОЙКИ (от пользователя) ===`);
    parts.push(prefsPrompt);
  }

  // Кастомные инструкции
  if (assistant.assistantConfig?.customInstructions) {
    parts.push(`\n=== ДОПОЛНИТЕЛЬНЫЕ ИНСТРУКЦИИ ===`);
    parts.push(assistant.assistantConfig.customInstructions);
  }

  // AI Skills
  if (assistant.aiSkills && assistant.aiSkills.length > 0) {
    parts.push(`\n=== АКТИВНЫЕ НАВЫКИ ===`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assistant.aiSkills.forEach(({ skill }: any) => {
      parts.push(`• ${skill.name}: ${skill.description || 'навык активен'}`);
    });
  }

  // Инструкции по использованию tools
  parts.push(`
=== 🛠 ИНСТРУМЕНТЫ ===
У тебя есть инструменты (tools) — ИСПОЛЬЗУЙ ИХ ВСЕГДА когда они подходят:

📄 **create_site** — создать сайт/страницу/трекер/калькулятор
   Когда: пользователь просит создать что-то веб-интерфейсное
   Действие: вызови tool с title и description

📋 **list_user_sites** — показать сайты пользователя
   Когда: пользователь спрашивает про свои сайты или нужна ссылка
   Действие: вызови tool, покажи результат

🎨 **update_site** — изменить существующий сайт
   Когда: пользователь хочет изменить цвета, тексты, дизайн
   Действие: сначала list_user_sites чтобы узнать slug, потом update_site

⏰ **create_reminder** — создать напоминание
   Когда: пользователь просит напомнить о чём-то
   Действие: вычисли время (Europe/Moscow), вызови tool

🔍 **web_search** — поиск в интернете
   Когда: нужна актуальная информация (новости, погода, курсы, факты)
   Действие: сформулируй поисковый запрос, вызови tool

⚠️ ВАЖНО:
- НЕ выдумывай ссылки и данные — используй tools чтобы получить реальную информацию
- НЕ говори "я не могу создать сайт" — ты МОЖЕШЬ через tool create_site
- Если tool вернул ошибку — сообщи пользователю и предложи альтернативу
- После успешного create_site — ОБЯЗАТЕЛЬНО покажи ссылку из результата
`);

  // Контекст
  const now = new Date();
  const dateStr = now.toLocaleDateString('ru-RU', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow'
  });
  
  parts.push(`\n=== КОНТЕКСТ ===`);
  parts.push(`📅 Сейчас: ${dateStr} (Москва)`);
  
  // Используем userName из preferences если есть
  const displayName = userPrefs?.userName || params.userName;
  if (displayName) {
    parts.push(`👤 Пользователь: ${displayName}`);
  }

  // Стиль общения
  parts.push(`
=== 💬 СТИЛЬ ===
- Дружелюбный и естественный, на «ты»
- Конкретный и по делу
- Отвечай на русском (если не попросят иначе)
- Не будь слишком формальным
- Если не знаешь — честно скажи, не выдумывай

=== 🎭 ПЕРСОНАЛИЗАЦИЯ ===
Ты можешь запоминать предпочтения пользователя! 
Когда юзер говорит:
- "Называй себя Макс" → запоминаешь имя
- "Называй меня Шеф" → запоминаешь как обращаться  
- "Люблю короткие ответы" → запоминаешь стиль
- "Запомни: я программист" → запоминаешь факт

После таких фраз подтверди: "Окей, теперь я Макс! 😊" или "Понял, буду звать тебя Шеф!"
`);

  return parts.filter(Boolean).join('\n');
}\n```\n\n# ФАЙЛ: src/routes/messages.ts\n```typescript\n/**
 * Маршруты обработки сообщений ассистента.
 * Приём пользовательских сообщений, маршрутизация через AI, streaming.
 */
import express, { type Response } from 'express';
import type { Plan } from '@grandbazar/database';
import { MessageRouter } from '../services/message-router.js';
import { extractTenantContext, type RequestWithTenant } from '../middleware/tenant-context.js';
import {
  sendMessageSchema,
  getMessagesQuerySchema,
  type SendMessageInput,
  type GetMessagesQuery,
} from '../validators/assistant.validators.js';

const router = express.Router();

// Применяем middleware для извлечения tenant context
router.use(extractTenantContext);

/**
 * POST /api/v1/assistants/:id/messages
 * Отправить сообщение помощнику
 */
router.post('/:id/messages', async (req: RequestWithTenant, res: Response) => {
  try {
    const { id: assistantId } = req.params;
    if (!assistantId) {
      res.status(400).json({ error: 'Assistant ID is required' });
      return;
    }

    const validated = sendMessageSchema.parse(req.body) as any;
    const { tenantId, userId, plan } = req.tenant!;

    const messageRouter = new MessageRouter(req.log);
    const result = await messageRouter.sendMessage({
      assistantId,
      tenantId,
      userId,
      plan: plan as Plan,
      data: validated,
    });

    res.json(result);
  } catch (error) {
    req.log.error({ error, assistantId: req.params.id }, 'Failed to send message');
    const message = error instanceof Error ? error.message : 'Internal server error';
    res.status(400).json({ error: message });
  }
});

/**
 * GET /api/v1/assistants/:id/messages
 * История сообщений (с пагинацией)
 */
router.get('/:id/messages', async (req: RequestWithTenant, res: Response) => {
  try {
    const { id: assistantId } = req.params;
    if (!assistantId) {
      res.status(400).json({ error: 'Assistant ID is required' });
      return;
    }

    const query = getMessagesQuerySchema.parse(req.query) as GetMessagesQuery;
    const { tenantId } = req.tenant!;

    const messageRouter = new MessageRouter(req.log);
    const result = await messageRouter.getMessages({
      assistantId,
      tenantId,
      limit: query.limit,
      offset: query.offset,
    });

    res.json(result);
  } catch (error) {
    req.log.error({ error, assistantId: req.params.id }, 'Failed to get messages');
    const message = error instanceof Error ? error.message : 'Internal server error';
    res.status(400).json({ error: message });
  }
});

/**
 * POST /api/v1/assistants/:id/messages/stream
 * SSE стриминг ответа помощника
 */
router.post('/:id/messages/stream', async (req: RequestWithTenant, res: Response) => {
  try {
    const { id: assistantId } = req.params;
    if (!assistantId) {
      res.status(400).json({ error: 'Assistant ID is required' });
      return;
    }

    const validated = sendMessageSchema.parse(req.body) as any;
    const { tenantId, userId, plan } = req.tenant!;

    // Настройка SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const messageRouter = new MessageRouter(req.log);
    const stream = messageRouter.streamMessage({
      assistantId,
      tenantId,
      userId,
      plan: plan as Plan,
      data: validated,
    });

    for await (const chunk of stream) {
      res.write(`data: ${chunk}\n\n`);
    }

    res.end();
  } catch (error) {
    req.log.error({ error, assistantId: req.params.id }, 'Failed to stream message');
    const message = error instanceof Error ? error.message : 'Internal server error';
    res.status(400).json({ error: message });
  }
});

export { router as messagesRouter };\n```\n