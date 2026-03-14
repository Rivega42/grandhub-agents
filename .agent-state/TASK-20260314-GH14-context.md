# СИСТЕМНЫЙ КОНТЕКСТ
Ты — Coder агент GrandHub. Твоя задача: реализовать код строго по TaskSpec.
Работай только в пределах file_scope. Запускай eval-loop.sh после каждого изменения.
\n# TASK SPEC\n{
  "task_id": "TASK-20260314-GH14",
  "title": "feat(assistant-runtime): кэшировать системный промпт в Redis",
  "description": "GitHub Issue #14: feat(assistant-runtime): кэшировать системный промпт в Redis\n\nСистемный промпт строится при каждом запросе — это 2-3 обращения к БД. Добавить кэш через Redis.\n\n## Сервис\nservices/assistant-runtime/\n\n## Файлы\n- src/services/prompt-builder.ts — добавить кэширование\n- src/config/index.ts — добавить REDIS_URL из env\n\n## Что сделать\n\nВ функции buildSystemPrompt():\n1. Сформировать ключ кэша: prompt:{assistantId}:{userId}\n2. Попробовать получить из Redis (GET)\n3. Если есть — вернуть сразу, не идти в БД\n4. Если нет — собрать промпт как обычно, сохранить в Redis с ",
  "service": "assistant-runtime",
  "type": "feat",
  "priority": "medium",
  "file_scope": [],
  "acceptance_criteria": [
    "Проблема из issue #14 устранена",
    "typecheck проходит без ошибок",
    "lint проходит без ошибок"
  ],
  "allow_test_failure": false,
  "max_retries": 3,
  "escalation_threshold": 2,
  "timeout_minutes": 30,
  "cost_budget_usd": 2,
  "created_at": "2026-03-14T13:06:10.073Z",
  "github_issue": {
    "number": 14,
    "url": "https://github.com/Rivega42/grandhub-feedback/issues/14",
    "author": "Rivega42"
  }
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
- Нужен для: api-gateway (проксирует `/api/assistants/*`), фронтенд\n\n# ФАЙЛ: src/app.ts\n```typescript\n/**
 * Express-приложение Assistant Runtime.
 * CORS, helmet, rate-limit, JWT-аутентификация, подключение маршрутов.
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import pinoHttp from 'pino-http';
import type { Logger } from 'pino';
import type { HealthCheckResponse, JwtPayload } from '@grandbazar/shared';
import { createAuthMiddleware } from '@grandbazar/shared';
import { assistantsRouter } from './routes/assistants.js';
import { messagesRouter } from './routes/messages.js';
import { skillsRouter } from './routes/skills.js';
import { simpleMessagesRouter } from './routes/simple-messages.js';
import { a2aRouter } from './routes/a2a.js';
import { calendarRouter } from './routes/calendar.js';
import { gmailRouter } from './routes/gmail.js';
import { remindersRouter } from './routes/reminders.js';
import expensesRouter from './routes/expenses.js';
import { searchRouter } from './routes/search.js';
import { config } from './config/index.js';

const startTime = Date.now();

/** Check PostgreSQL connectivity via DATABASE_URL */
async function checkDatabase(): Promise<{ name: string; status: 'ok' | 'error'; message?: string }> {
  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) return { name: 'database', status: 'error', message: 'DATABASE_URL not set' };
  try {
    const net = await import('node:net');
    const url = new URL(dbUrl);
    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection(
        { host: url.hostname, port: parseInt(url.port || '5432', 10), timeout: 2000 },
        () => {
          socket.destroy();
          resolve();
        },
      );
      socket.on('error', reject);
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('timeout'));
      });
    });
    return { name: 'database', status: 'ok' };
  } catch {
    return { name: 'database', status: 'error', message: 'Database unreachable' };
  }
}

export function createApp(logger: Logger): express.Application {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(pinoHttp({ logger }));

  // Rate limiting
  app.use(
    rateLimit({
      windowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] ?? '60000', 10),
      max: parseInt(process.env['RATE_LIMIT_MAX_REQUESTS'] ?? '200', 10),
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  // ── Simple message API (bot-facing, internal key auth) ──────
  // Mounted BEFORE JWT middleware — uses its own auth (x-internal-key)
  app.use("/api/v1/a2a", a2aRouter);
  app.use('/api/v1', simpleMessagesRouter);
  app.use("/api/v1/calendar", calendarRouter);
  app.use("/api/v1/gmail", gmailRouter);
  app.use('/api/v1', remindersRouter);
  app.use("/api/v1/expenses", expensesRouter);
  app.use('/api/v1', searchRouter);

  // JWT auth — protect all routes except health/ready
  app.use(
    createAuthMiddleware({
      verifyToken: (token: string) => {
        return jwt.verify(token, config.jwtSecret) as JwtPayload;
      },
      publicPaths: ['/health', '/ready'],
    }),
  );

  // Health check
  app.get('/health', async (_req, res) => {
    const checks: Array<{ name: string; status: 'ok' | 'error'; message?: string }> = [
      { name: 'self', status: 'ok' },
    ];

    const dbCheck = await checkDatabase();
    checks.push(dbCheck);

    const overallStatus = checks.every((c) => c.status === 'ok') ? 'ok' : 'degraded';
    const statusCode = overallStatus === 'ok' ? 200 : 503;

    const response = {
      status: overallStatus as 'ok' | 'error',
      service: 'assistant-runtime',
      version: '0.1.0',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
      checks,
    };
    res.status(statusCode).json(response);
  });

  app.get('/ready', (_req, res) => {
    res.json({ ready: true });
  });

  // ── Assistant Runtime routes ────────────────────────────────
  app.use('/api/v1/assistants', assistantsRouter);
  app.use('/api/v1/assistants', messagesRouter);
  app.use('/api/v1', skillsRouter);

  // Global error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error(err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: process.env['NODE_ENV'] === 'development' ? err.message : undefined,
    });
  });

  return app;
}\n```\n\n# ФАЙЛ: src/index.ts\n```typescript\n/**
 * Точка входа Assistant Runtime.
 * Запуск Express-сервера, инициализация cron-задач (напоминания).
 */
import 'dotenv/config';
import { createServiceRunner } from '@grandbazar/shared';
import { createApp } from './app.js';
import { config } from './config/index.js';
import { reminderScheduler } from './services/reminder-scheduler.js';

const run = createServiceRunner({
  name: 'assistant-runtime',
  port: config.port,
  portEnv: 'ASSISTANT_RUNTIME_PORT',
  emoji: '🤖',
  createApp: createApp as any,
});

// Запустить scheduler после инициализации
void run().then(() => {
  console.log('🔔 Starting Reminder Scheduler...');
  reminderScheduler.start().catch((err) => {
    console.error('Failed to start Reminder Scheduler:', err);
  });
});\n```\n\n# ФАЙЛ: src/models/assistant.ts\n```typescript\n/**
 * Модели и типы ассистента.
 * AssistantStatus, SkillCategory, конфигурация персонализации.
 */
export type AssistantStatus = 'RUNNING' | 'STOPPED' | 'ERROR' | 'PROVISIONING';
export type MessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM';

export interface Assistant {
  id: string;
  tenantId: string;
  name: string;
  personality?: string;
  status: AssistantStatus;
  config?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssistantSkill {
  id: string;
  assistantId: string;
  skillId: string;
  config?: Record<string, unknown>;
  enabledAt: Date;
}

export interface Message {
  id: string;
  assistantId: string;
  role: MessageRole;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface SkillCategory {
  id: string;
  name: string;
  description: string;
  category: 'finance' | 'schedule' | 'shopping' | 'health' | 'education' | 'travel';
  tier: 'free' | 'start' | 'pro' | 'business';
  icon: string;
  systemPrompt: string;
  tools: string[];
}

export interface CreateAssistantDto {
  name: string;
  personality?: string;
  skills?: string[];
}

export interface UpdateAssistantDto {
  name?: string;
  personality?: string;
}

export interface SendMessageDto {
  content: string;
  metadata?: Record<string, unknown>;
}\n```\n\n# ФАЙЛ: src/middleware/tenant-context.ts\n```typescript\n/**
 * Middleware извлечения tenant-контекста из JWT.
 * Определение userId, tenantId, плана для multi-tenant запросов.
 */
import type { Request, Response, NextFunction } from 'express';
import type { JwtPayload } from '@grandbazar/shared';

export interface TenantContext {
  tenantId: string;
  userId: string;
  plan: string;
}

// Расширенный JwtPayload с дополнительными полями для assistant-runtime
export interface ExtendedJwtPayload {
  sub?: string;
  userId?: string;
  tenantId?: string;
  exp?: number;
  iat?: number;
  plan?: string;
}

export interface RequestWithTenant extends Request {
  user?: ExtendedJwtPayload;
  tenant?: TenantContext;
}

/**
 * Middleware для извлечения tenant context из JWT
 */
export function extractTenantContext(req: RequestWithTenant, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // sub - это userId, plan может быть в custom claims
  const userId = req.user.userId || req.user.sub;
  const { tenantId, plan } = req.user;

  if (!tenantId || !userId) {
    res.status(401).json({ error: 'Invalid token: missing tenant or user information' });
    return;
  }

  req.tenant = {
    tenantId,
    userId,
    plan: plan || 'FREE',
  };

  next();
}\n```\n\n# ФАЙЛ: src/config/index.ts\n```typescript\n/**
 * Конфигурация Assistant Runtime.
 * Типы планов, лимиты токенов, ключи API-провайдеров.
 */
import type { Plan } from '@grandbazar/database';

export interface PlanLimits {
  maxAssistants: number;
  maxMessagesPerDay: number;
  model: string;
  features: string[];
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  FREE: {
    maxAssistants: 1,
    maxMessagesPerDay: 50,
    model: 'anthropic/claude-haiku-4-5',
    features: ['basic_skills', 'web_search'],
  },
  START: {
    maxAssistants: 3,
    maxMessagesPerDay: 200,
    model: 'anthropic/claude-haiku-4-5',
    features: ['basic_skills', 'advanced_skills', 'web_search', 'image_analysis'],
  },
  PRO: {
    maxAssistants: 10,
    maxMessagesPerDay: 1000,
    model: 'anthropic/claude-sonnet-4-5',
    features: ['basic_skills', 'advanced_skills', 'premium_skills', 'web_search', 'image_analysis', 'voice'],
  },
  BUSINESS: {
    maxAssistants: -1, // unlimited
    maxMessagesPerDay: -1, // unlimited
    model: 'anthropic/claude-opus-4-5',
    features: ['all_skills', 'web_search', 'image_analysis', 'voice', 'priority_support', 'api_access'],
  },
};

export const config = {
  port: parseInt(process.env['ASSISTANT_RUNTIME_PORT'] || '4005', 10),
  jwtSecret: process.env['JWT_SECRET'] || 'dev-secret-change-me',
  openclaw: {
    installPath: process.env['OPENCLAW_PATH'] || '/usr/local/bin/openclaw',
    workspaceBase: process.env['OPENCLAW_WORKSPACE_BASE'] || '/var/lib/grandbazar/assistants',
  },
  limits: PLAN_LIMITS,
};\n```\n\n# ФАЙЛ: src/validators/assistant.validators.ts\n```typescript\n/**
 * Zod-валидаторы для API ассистентов.
 * Схемы: создание ассистента, обновление настроек, отправка сообщений.
 */
import { z } from 'zod';

export const createAssistantSchema = z.object({
  name: z.string().min(1).max(100),
  personality: z.string().max(500).optional(),
  skills: z.array(z.string()).optional().default([]),
});

export const updateAssistantSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  personality: z.string().max(500).optional(),
});

export const sendMessageSchema = z.object({
  content: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

export const getMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const addSkillSchema = z.object({
  skillId: z.string(),
  config: z.record(z.unknown()).optional(),
});

export type CreateAssistantInput = z.infer<typeof createAssistantSchema>;
export type UpdateAssistantInput = z.infer<typeof updateAssistantSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type GetMessagesQuery = z.infer<typeof getMessagesQuerySchema>;
export type AddSkillInput = z.infer<typeof addSkillSchema>;\n```\n\n# ФАЙЛ: src/routes/simple-messages.ts\n```typescript\n/**
 * Упрощённый маршрут обработки сообщений.
 * Быстрый ответ без полного пайплайна (для лёгких запросов).
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDbClient } from '@grandbazar/database';
import { checkLimits, recordUsage } from '../services/usage-tracker.js';
import { invokeAgentGraph } from '../agents/index.js';

const router = Router();

const INTERNAL_API_KEY = process.env['INTERNAL_API_KEY'] || 'grandhub-internal-dev';

/**
 * POST /api/v1/messages
 * Simple message endpoint for the Telegram bot.
 * Finds user's default assistant and saves message + generates AI response.
 * Protected by internal API key.
 * Includes usage tracking and plan limits.
 * 
 * 🚀 Now uses LangGraph directly (no Docker)!
 */
router.post('/messages', async (req: Request, res: Response) => {
  try {
    // Verify internal API key
    const apiKey = req.headers['x-internal-key'];
    if (apiKey !== INTERNAL_API_KEY) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { userId, message, messageType = 'text', imageBase64, imageMimeType } = req.body;

    if (!userId || !message) {
      res.status(400).json({ error: 'userId and message are required' });
      return;
    }

    const prisma = getDbClient();

    // Find user's tenant and plan
    const membership = await prisma.tenantMember.findFirst({
      where: { userId },
      include: { 
        tenant: true,
        user: true,
      },
    });

    if (!membership) {
      res.status(404).json({ error: 'User has no tenant' });
      return;
    }

    const tenantId = membership.tenantId;
    const plan = membership.tenant.plan;
    const userName = membership.user.name;

    // Find user's first (default) assistant
    let assistant = await prisma.assistant.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });

    // If no assistant exists, create a default one
    if (!assistant) {
      assistant = await prisma.assistant.create({
        data: {
          tenantId,
          name: 'Помощник',
          status: 'RUNNING',
          config: {},
        },
      });
    }

    // 1. Проверить лимиты
    const limits = await checkLimits(tenantId, plan);
    
    if (!limits.allowed) {
      const upgradeMessage = getUpgradeMessage(plan, limits.limit);
      
      // Сохранить user message
      await prisma.message.create({
        data: {
          assistantId: assistant.id,
          role: 'USER',
          content: message,
          metadata: { messageType } as any,
        },
      });

      // Сохранить limit message
      await prisma.message.create({
        data: {
          assistantId: assistant.id,
          role: 'ASSISTANT',
          content: upgradeMessage,
        },
      });

      res.json({
        response: upgradeMessage,
        assistantId: assistant.id,
        limitReached: true,
      });
      return;
    }

    // 2. Сохранить user message
    await prisma.message.create({
      data: {
        assistantId: assistant.id,
        role: 'USER',
        content: message,
        metadata: { messageType, hasImage: !!imageBase64 } as any,
      },
    });

    // 3. Получить историю сообщений для контекста
    const historyMessages = await prisma.message.findMany({
      where: { assistantId: assistant.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const formattedHistory = historyMessages
      .reverse()
      .slice(0, -1) // Exclude the message we just saved
      .map((msg) => ({
        role: msg.role === 'USER' ? ('user' as const) : ('assistant' as const),
        content: msg.content,
      }));

    // 4. 🚀 Вызов LangGraph напрямую!
    console.log(`🤖 Invoking LangGraph for user ${userId} (plan: ${plan})`);
    console.log(`   Has image: ${!!imageBase64}`);
    
    const result = await invokeAgentGraph({
      userMessage: message,
      userId,
      assistantId: assistant.id,
      userName: userName || undefined,
      imageBase64,
      imageMimeType,
      historyMessages: formattedHistory,
    });

    console.log(`✅ LangGraph completed: agent=${result.agent}, model=${result.model}`);
    console.log(`   Iterations: ${result.iterations}, agents: ${result.agentSequence.join(' → ')}`);

    // 4.5. Обработка персонализации (если есть)
    if (result.personalizationData) {
      const { type, value } = result.personalizationData;
      console.log(`🎭 Personalization detected: ${type} = "${value}"`);
      
      try {
        // Получить или создать конфиг ассистента
        let config = await prisma.assistantConfig.findUnique({
          where: { assistantId: assistant.id },
        });
        
        if (!config) {
          config = await prisma.assistantConfig.create({
            data: {
              assistantId: assistant.id,
            },
          });
        }
        
        // Обновить соответствующее поле
        const updateData: any = {};
        
        switch (type) {
          case 'name':
            updateData.name = value;
            break;
          
          case 'personality':
            updateData.personality = value;
            break;
          
          case 'instruction':
            const existingInstructions = config.customInstructions || '';
            const newInstruction = existingInstructions 
              ? `${existingInstructions}\n- ${value}` 
              : `- ${value}`;
            updateData.customInstructions = newInstruction;
            break;
        }
        
        await prisma.assistantConfig.update({
          where: { assistantId: assistant.id },
          data: updateData,
        });
        
        console.log(`✅ Personalization saved to database`);
      } catch (error) {
        console.error('❌ Failed to save personalization:', error);
        // Не блокируем основной поток, просто логируем
      }
    }

    // 5. Записать usage (примерные токены)
    const estimatedInputTokens = Math.ceil(message.length / 4);
    const estimatedOutputTokens = Math.ceil(result.response.length / 4);
    
    await recordUsage(
      tenantId,
      assistant.id,
      result.model || 'openrouter/auto',
      estimatedInputTokens,
      estimatedOutputTokens
    );

    console.log(
      `📊 Usage recorded: ${estimatedInputTokens} input + ${estimatedOutputTokens} output tokens`
    );

    // 6. Сохранить ответ в БД
    await prisma.message.create({
      data: {
        assistantId: assistant.id,
        role: 'ASSISTANT',
        content: result.response,
        metadata: {
          model: result.model,
          agent: result.agent,
          iterations: result.iterations,
          agentSequence: result.agentSequence,
          inputTokens: estimatedInputTokens,
          outputTokens: estimatedOutputTokens,
          toolResults: result.toolResults,
        } as any,
      },
    });

    // 7. Вернуть ответ
    res.json({
      response: result.response,
      assistantId: assistant.id,
      meta: {
        agent: result.agent,
        model: result.model,
        iterations: result.iterations,
        agentSequence: result.agentSequence,
      },
      usage: {
        model: result.model,
        inputTokens: estimatedInputTokens,
        outputTokens: estimatedOutputTokens,
        remaining: limits.remaining - 1,
      },
    });
  } catch (error) {
    console.error('❌ Error processing message:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

/**
 * Сообщение об исчерпании лимита с призывом к upgrade
 */
function getUpgradeMessage(currentPlan: string, limit: number): string {
  const messages = {
    FREE: `🚫 **Лимит исчерпан!**

Ты использовал все ${limit} сообщений на сегодня по тарифу FREE.

✨ **Upgrade до START** (299₽/мес):
• 200 сообщений/день
• Быстрая модель Claude Haiku
• Приоритетная поддержка

🚀 **Или сразу до PRO** (990₽/мес):
• 1000 сообщений/день
• Продвинутая модель Claude Sonnet
• Все фишки платформы

Напиши /upgrade для улучшения тарифа!`,
    
    START: `🚫 **Лимит исчерпан!**

Ты использовал все ${limit} сообщений на сегодня по тарифу START.

🚀 **Upgrade до PRO** (990₽/мес):
• 1000 сообщений/день (в 5 раз больше!)
• Продвинутая модель Claude Sonnet
• Более глубокое понимание контекста

💼 **Или до BUSINESS** (1990₽/мес):
• Безлимитные сообщения
• Топовая модель Claude Opus
• Персональная поддержка

Напиши /upgrade для улучшения тарифа!`,
    
    PRO: `🚫 **Лимит исчерпан!**

Ты использовал все ${limit} сообщений на сегодня по тарифу PRO.

💼 **Upgrade до BUSINESS** (1990₽/мес):
• ∞ Безлимитные сообщения
• 🧠 Топовая модель Claude Opus
• 🎯 Персональная поддержка
• 🔥 Приоритетная обработка

Напиши /upgrade для улучшения тарифа!`,
  };

  return messages[currentPlan as keyof typeof messages] || messages.FREE;
}

export { router as simpleMessagesRouter };\n```\n\n# ФАЙЛ: src/routes/gmail.ts\n```typescript\n/**
 * Маршруты интеграции с Gmail.
 * Чтение писем, поиск, обработка вложений через Google API.
 */
import express from 'express';
import { google } from 'googleapis';
import { PrismaClient } from '@grandbazar/database';

const prisma = new PrismaClient();
const router = express.Router();

// Google OAuth2 config (shared with calendar)
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'YOUR_CLIENT_SECRET';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/v1/calendar/callback';

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

// Helper: refresh access token if expired
async function refreshAccessToken(userId: string) {
  const auth = await prisma.googleCalendarAuth.findUnique({ where: { userId } });
  if (!auth) throw new Error('No auth found');

  if (new Date() < auth.expiresAt) {
    return auth.accessToken; // Still valid
  }

  oauth2Client.setCredentials({ refresh_token: auth.refreshToken });
  const { credentials } = await oauth2Client.refreshAccessToken();

  if (!credentials.access_token) throw new Error('Failed to refresh token');

  await prisma.googleCalendarAuth.update({
    where: { userId },
    data: {
      accessToken: credentials.access_token,
      expiresAt: new Date(credentials.expiry_date || Date.now() + 3600000),
    },
  });

  return credentials.access_token;
}

// Helper: decode email body
function decodeEmailBody(parts: any[]): string {
  let body = '';

  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      body += Buffer.from(part.body.data, 'base64').toString('utf-8');
    } else if (part.mimeType === 'text/html' && part.body?.data && !body) {
      // Fallback to HTML if no plain text
      body += Buffer.from(part.body.data, 'base64').toString('utf-8');
    } else if (part.parts) {
      body += decodeEmailBody(part.parts);
    }
  }

  return body;
}

// GET /api/v1/gmail/inbox/:userId
router.get('/inbox/:userId', async (req, res) => {
  const { userId } = req.params;
  const maxResults = parseInt(req.query.limit as string) || 20;

  try {
    const accessToken = await refreshAccessToken(userId);
    oauth2Client.setCredentials({ access_token: accessToken });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      labelIds: ['INBOX'],
    });

    const messages = response.data.messages || [];

    // Fetch details for each message
    const detailedMessages = await Promise.all(
      messages.map(async (msg) => {
        const details = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'metadata',
          metadataHeaders: ['From', 'To', 'Subject', 'Date'],
        });

        const headers = details.data.payload?.headers || [];
        const from = headers.find((h) => h.name === 'From')?.value || '';
        const to = headers.find((h) => h.name === 'To')?.value || '';
        const subject = headers.find((h) => h.name === 'Subject')?.value || '';
        const date = headers.find((h) => h.name === 'Date')?.value || '';

        return {
          id: msg.id,
          threadId: msg.threadId,
          from,
          to,
          subject,
          date,
          snippet: details.data.snippet,
        };
      })
    );

    res.json({ messages: detailedMessages });
  } catch (error: any) {
    console.error('Fetch inbox error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/gmail/message/:userId/:messageId
router.get('/message/:userId/:messageId', async (req, res) => {
  const { userId, messageId } = req.params;

  try {
    const accessToken = await refreshAccessToken(userId);
    oauth2Client.setCredentials({ access_token: accessToken });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    const headers = response.data.payload?.headers || [];
    const from = headers.find((h) => h.name === 'From')?.value || '';
    const to = headers.find((h) => h.name === 'To')?.value || '';
    const subject = headers.find((h) => h.name === 'Subject')?.value || '';
    const date = headers.find((h) => h.name === 'Date')?.value || '';

    let body = '';
    if (response.data.payload?.body?.data) {
      body = Buffer.from(response.data.payload.body.data, 'base64').toString('utf-8');
    } else if (response.data.payload?.parts) {
      body = decodeEmailBody(response.data.payload.parts);
    }

    res.json({
      id: response.data.id,
      threadId: response.data.threadId,
      from,
      to,
      subject,
      date,
      body,
      snippet: response.data.snippet,
    });
  } catch (error: any) {
    console.error('Fetch message error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/gmail/send
router.post('/send', async (req, res) => {
  const { userId, to, subject, body } = req.body;

  if (!userId || !to || !subject || !body) {
    res.status(400).json({ error: 'Missing required fields: userId, to, subject, body' });
    return;
  }

  try {
    const accessToken = await refreshAccessToken(userId);
    oauth2Client.setCredentials({ access_token: accessToken });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const messageParts = [
      'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
      `To: ${to}`,
      `Subject: ${utf8Subject}`,
      '',
      body,
    ];

    const message = messageParts.join('\n');
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    res.json({ success: true, messageId: response.data.id });
  } catch (error: any) {
    console.error('Send email error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/gmail/search/:userId?q=...
router.get('/search/:userId', async (req, res) => {
  const { userId } = req.params;
  const query = req.query.q as string;
  const maxResults = parseInt(req.query.limit as string) || 20;

  if (!query) {
    res.status(400).json({ error: 'Query parameter q is required' });
    return;
  }

  try {
    const accessToken = await refreshAccessToken(userId);
    oauth2Client.setCredentials({ access_token: accessToken });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults,
    });

    const messages = response.data.messages || [];

    // Fetch details for each message
    const detailedMessages = await Promise.all(
      messages.map(async (msg) => {
        const details = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'metadata',
          metadataHeaders: ['From', 'To', 'Subject', 'Date'],
        });

        const headers = details.data.payload?.headers || [];
        const from = headers.find((h) => h.name === 'From')?.value || '';
        const to = headers.find((h) => h.name === 'To')?.value || '';
        const subject = headers.find((h) => h.name === 'Subject')?.value || '';
        const date = headers.find((h) => h.name === 'Date')?.value || '';

        return {
          id: msg.id,
          threadId: msg.threadId,
          from,
          to,
          subject,
          date,
          snippet: details.data.snippet,
        };
      })
    );

    res.json({ messages: detailedMessages });
  } catch (error: any) {
    console.error('Search emails error:', error);
    res.status(500).json({ error: error.message });
  }
});

export { router as gmailRouter };\n```\n\n# ФАЙЛ: src/routes/search.ts\n```typescript\n/**
 * Маршруты веб-поиска.
 * Проксирование запросов к Brave Search API.
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import { searchWeb } from '../services/web-search.js';

const router = Router();

const INTERNAL_API_KEY = process.env['INTERNAL_API_KEY'] || 'grandhub-internal-dev';

/**
 * GET /api/v1/search?q=...&count=5
 * Simple web search endpoint (internal use)
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    // Verify internal API key
    const apiKey = req.headers['x-internal-key'];
    if (apiKey !== INTERNAL_API_KEY) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { q, count } = req.query;

    if (!q || typeof q !== 'string') {
      res.status(400).json({ error: 'Query parameter "q" is required' });
      return;
    }

    const countNum = count ? parseInt(String(count), 10) : 5;
    
    if (isNaN(countNum) || countNum < 1 || countNum > 20) {
      res.status(400).json({ error: 'Count must be between 1 and 20' });
      return;
    }

    console.log(`🔍 Web search: "${q}" (count: ${countNum})`);

    const results = await searchWeb(q, countNum);

    res.json({
      query: q,
      count: results.length,
      results,
    });
  } catch (error) {
    console.error('Error in search endpoint:', error);
    res.status(500).json({ error: 'Failed to perform search' });
  }
});

export { router as searchRouter };\n```\n\n# ФАЙЛ: src/routes/skills.ts\n```typescript\n/**
 * Маршруты каталога навыков.
 * Список доступных навыков, активация/деактивация для ассистента.
 */
import express, { type Response } from 'express';
import type { Plan } from '@grandbazar/database';
import { skillRegistry } from '../services/skill-registry.js';
import { AssistantManager } from '../services/assistant-manager.js';
import { extractTenantContext, type RequestWithTenant } from '../middleware/tenant-context.js';
import { addSkillSchema, type AddSkillInput } from '../validators/assistant.validators.js';

const router = express.Router();

// Применяем middleware для извлечения tenant context
router.use(extractTenantContext);

/**
 * GET /api/v1/skills
 * Каталог доступных навыков
 */
router.get('/', (req: RequestWithTenant, res: Response) => {
  try {
    const { plan } = req.tenant!;

    // Определяем tier по плану
    const tierMap: Record<string, 'free' | 'start' | 'pro' | 'business'> = {
      FREE: 'free',
      START: 'start',
      PRO: 'pro',
      BUSINESS: 'business',
    };
    const tier = tierMap[plan] || 'free';

    const availableSkills = skillRegistry.getSkillsForTier(tier);
    const allSkills = skillRegistry.getAllSkills();

    res.json({
      skills: allSkills.map((skill) => ({
        ...skill,
        available: availableSkills.some((s) => s.id === skill.id),
      })),
      userTier: tier,
    });
  } catch (error) {
    req.log.error({ error }, 'Failed to get skills');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/v1/assistants/:id/skills
 * Добавить навык помощнику
 */
router.post('/:id/skills', async (req: RequestWithTenant, res: Response) => {
  try {
    const { id: assistantId } = req.params;
    if (!assistantId) {
      res.status(400).json({ error: 'Assistant ID is required' });
      return;
    }

    const validated = addSkillSchema.parse(req.body) as AddSkillInput;
    const { tenantId, plan } = req.tenant!;

    const assistantManager = new AssistantManager(req.log);
    const skill = await assistantManager.addSkill(
      assistantId,
      tenantId,
      plan as Plan,
      validated.skillId,
      validated.config,
    );

    res.status(201).json({ skill });
  } catch (error) {
    req.log.error({ error, assistantId: req.params.id }, 'Failed to add skill');
    const message = error instanceof Error ? error.message : 'Internal server error';
    res.status(400).json({ error: message });
  }
});

/**
 * DELETE /api/v1/assistants/:id/skills/:skillId
 * Убрать навык у помощника
 */
router.delete('/:id/skills/:skillId', async (req: RequestWithTenant, res: Response) => {
  try {
    const { id: assistantId, skillId } = req.params;
    if (!assistantId || !skillId) {
      res.status(400).json({ error: 'Assistant ID and Skill ID are required' });
      return;
    }

    const { tenantId, plan } = req.tenant!;

    const assistantManager = new AssistantManager(req.log);
    await assistantManager.removeSkill(assistantId, tenantId, plan as Plan, skillId);

    res.status(204).send();
  } catch (error) {
    req.log.error(
      { error, assistantId: req.params.id, skillId: req.params.skillId },
      'Failed to remove skill',
    );
    const message = error instanceof Error ? error.message : 'Internal server error';
    res.status(400).json({ error: message });
  }
});

export { router as skillsRouter };\n```\n