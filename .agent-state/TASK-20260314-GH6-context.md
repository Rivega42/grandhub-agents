# СИСТЕМНЫЙ КОНТЕКСТ
Ты — Coder агент GrandHub. Твоя задача: реализовать код строго по TaskSpec.
Работай только в пределах file_scope. Запускай eval-loop.sh после каждого изменения.
\n# TASK SPEC\n{
  "task_id": "TASK-20260314-GH6",
  "title": "feat(skill-registry): расширить схему ai_skills для маркетплейса",
  "description": "GitHub Issue #6: feat(skill-registry): расширить схему ai_skills для маркетплейса\n\nНужно расширить таблицу ai_skills для поддержки маркетплейса скиллов.\n\n## Задача\n\nДобавить миграцию Prisma/SQL:\n\n```sql\nALTER TABLE ai_skills ADD COLUMN IF NOT EXISTS\n  level         SMALLINT DEFAULT 0,\n  visibility    VARCHAR(16) DEFAULT private,\n  author_id     BIGINT,\n  price_model   VARCHAR(16) DEFAULT free,\n  price_cents   INTEGER DEFAULT 0,\n  currency      VARCHAR(3) DEFAULT RUB,\n  status        VARCHAR(16) DEFAULT draft,\n  rating_avg    DECIMAL(3,2) DEFAULT 0,\n  install_count INTEGER DEFA",
  "service": "auth",
  "type": "feat",
  "priority": "medium",
  "file_scope": [],
  "acceptance_criteria": [
    "Проблема из issue #6 устранена",
    "typecheck проходит без ошибок",
    "lint проходит без ошибок"
  ],
  "allow_test_failure": false,
  "max_retries": 3,
  "escalation_threshold": 2,
  "timeout_minutes": 30,
  "cost_budget_usd": 2,
  "created_at": "2026-03-14T09:58:08.142Z",
  "github_issue": {
    "number": 6,
    "url": "https://github.com/Rivega42/grandhub-feedback/issues/6",
    "author": "Rivega42"
  }
}\n\n# AGENT.md — auth\n# AGENT.md — auth (Сервис аутентификации)

> Этот файл предназначен для AI-агентов. Прочитай его полностью перед работой с сервисом.

## Назначение

Сервис аутентификации и авторизации GrandHub. Выдаёт JWT-токены, управляет сессиями, поддерживает OAuth через Telegram, VK, Yandex, Sber. Хранит пользователей в PostgreSQL, refresh-токены в Redis.

## Технологии

- **Язык:** TypeScript 5.x
- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **БД:** PostgreSQL (через `@grandbazar/database`, Prisma)
- **Кэш/Сессии:** Redis (ioredis)
- **Тесты:** Vitest + Supertest
- **Сборка:** tsc -b
- **Логирование:** Pino + pino-http
- **Валидация:** Zod
- **Auth:** jsonwebtoken, bcryptjs
- **Трассировка:** OpenTelemetry

## Точки входа

- `src/index.ts` — запуск сервиса (порт `AUTH_SERVICE_PORT` или **4001**)
- `src/app.ts` — Express приложение, middleware, маршруты
- `src/routes/auth.ts` — публичные: `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/refresh`, OAuth
- `src/routes/users.ts` — пользователи: `/users/me`, `/users/:id`
- `src/routes/internal.ts` — внутренние маршруты для межсервисного общения
- `src/services/auth.service.ts` — бизнес-логика: register, login, refresh, logout
- `src/services/telegram.service.ts` — OAuth через Telegram
- `src/services/vk.service.ts` — OAuth через VK
- `src/services/yandex.service.ts` — OAuth через Yandex
- `src/middleware/error-handler.ts` — глобальный обработчик ошибок
- `src/middleware/require-auth.ts` — JWT middleware
- `src/config/index.ts` — конфигурация (JWT секреты, Redis, OAuth)
- `src/validators/auth.validators.ts` — Zod схемы валидации

## Маршруты API

| Метод | Путь | Назначение |
|-------|------|-----------|
| POST | /auth/register | Регистрация нового пользователя |
| POST | /auth/login | Вход по email+password → JWT |
| POST | /auth/logout | Инвалидация refresh-токена |
| POST | /auth/refresh | Обновление JWT по refresh-токену |
| POST | /auth/telegram | OAuth через Telegram |
| POST | /auth/vk | OAuth через VK |
| POST | /auth/yandex | OAuth через Yandex |
| POST | /auth/sber | OAuth через Sber ID |
| GET | /users/me | Профиль текущего пользователя |
| GET | /health | Health check |

## Подводные камни

> Обязательно прочитай это перед изменениями!

- ⚠️ **JWT секреты** — `JWT_SECRET` и `JWT_REFRESH_SECRET` в production обязательны, в dev используются дефолтные (см. `config/index.ts`)
- ⚠️ **bcrypt saltRounds = 12** — не снижать, это влияет на безопасность
- ⚠️ **Access token живёт 15 минут**, refresh — 7 дней. Не менять без согласования с api-gateway
- ⚠️ **`@grandbazar/shared`** — пакет workspace. Нельзя обновить только в auth, нужно обновлять в монорепо
- ⚠️ **Prisma** — изменения схемы через `pnpm prisma migrate dev` из `/opt/grandhub-v3/packages/database`
- ⚠️ **rate-limit** — уже настроен в `app.ts` через `express-rate-limit`. Не дублировать
- ⚠️ **`createServiceRunner`** из `@grandbazar/shared` — запускает сервис с graceful shutdown, не заменять на простой `app.listen()`

## Как запустить локально

```bash
cd /opt/grandhub-v3/services/auth

# Установить зависимости
pnpm install

# Запуск в dev режиме
pnpm dev

# Сборка
pnpm build

# Запуск после сборки
pnpm start

# Тесты
pnpm test

# TypeCheck
pnpm typecheck

# Lint
pnpm lint
```

## Переменные окружения

| Переменная | Описание | Пример | Обязательная |
|-----------|---------|--------|-------------|
| `AUTH_SERVICE_PORT` | Порт сервиса | `4001` | ✅ |
| `DATABASE_URL` | PostgreSQL URL | `postgresql://user:pass@localhost/grandbazar` | ✅ |
| `REDIS_URL` | Redis URL | `redis://localhost:6379` | ✅ |
| `JWT_SECRET` | Секрет для access token | `64-char-random-string` | ✅ prod |
| `JWT_REFRESH_SECRET` | Секрет для refresh token | `64-char-random-string` | ✅ prod |
| `TELEGRAM_BOT_TOKEN` | Токен Telegram бота | `123456:ABC...` | ✅ |
| `VK_CLIENT_ID` | VK App ID | `12345678` | ⬜ |
| `VK_CLIENT_SECRET` | VK App Secret | `abc...` | ⬜ |
| `YANDEX_CLIENT_ID` | Yandex OAuth Client ID | `abc...` | ⬜ |
| `YANDEX_CLIENT_SECRET` | Yandex OAuth Secret | `abc...` | ⬜ |
| `NODE_ENV` | Окружение | `production` | ✅ |
| `LOG_LEVEL` | Уровень логов | `info` | ⬜ |

## Зависимости от других сервисов

- Зависит от: PostgreSQL, Redis
- Нужен для: api-gateway (проксирует `/auth/*`), все сервисы (проверяют JWT через shared middleware)\n\n# ФАЙЛ: src/app.ts\n```typescript\n/**
 * Express-приложение auth-сервиса.
 * Настраивает middleware (CORS, helmet, rate-limit, JWT), маршруты и health-check.
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
import { createErrorHandler } from './middleware/error-handler.js';
import { authRouter } from './routes/auth.js';
import { internalRouter } from './routes/internal.js';
import usersRouter from './routes/users.js';
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
        () => { socket.destroy(); resolve(); },
      );
      socket.on('error', reject);
      socket.on('timeout', () => { socket.destroy(); reject(new Error('timeout')); });
    });
    return { name: 'database', status: 'ok' };
  } catch {
    return { name: 'database', status: 'error', message: 'Database unreachable' };
  }
}

/** Check Redis connectivity via REDIS_URL */
async function checkRedis(): Promise<{ name: string; status: 'ok' | 'error'; message?: string }> {
  const redisUrl = process.env['REDIS_URL'];
  if (!redisUrl) return { name: 'redis', status: 'error', message: 'REDIS_URL not set' };
  try {
    const net = await import('node:net');
    const url = new URL(redisUrl);
    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection(
        { host: url.hostname, port: parseInt(url.port || '6379', 10), timeout: 2000 },
        () => { socket.destroy(); resolve(); },
      );
      socket.on('error', reject);
      socket.on('timeout', () => { socket.destroy(); reject(new Error('timeout')); });
    });
    return { name: 'redis', status: 'ok' };
  } catch {
    return { name: 'redis', status: 'error', message: 'Redis unreachable' };
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

  // ── Internal routes (service-to-service, API key auth) ──
  // Mounted BEFORE JWT middleware — uses its own auth (x-internal-key)
  app.use('/api/v1/internal', internalRouter);

  // JWT auth — protect all routes except health/ready and public auth endpoints
  app.use(
    createAuthMiddleware({
      verifyToken: (token: string) => {
        return jwt.verify(token, config.jwt.secret) as JwtPayload;
      },
      publicPaths: [
        '/api/v1/auth/register',
        '/api/v1/auth/login',
        '/api/v1/auth/refresh',
        '/api/v1/auth/telegram',
        '/api/v1/auth/vk',
        '/api/v1/auth/yandex',
        '/api/v1/auth/sber',
        '/api/v1/users/by-username/:username',
        '/api/v1/users/:id/public',
        '/api/v1/users/:id/skills',
      ],
    }),
  );

  // Health check — checks real dependencies (DB + Redis)
  app.get('/health', async (_req, res) => {
    const checks: Array<{ name: string; status: 'ok' | 'error'; message?: string }> = [
      { name: 'self', status: 'ok' },
    ];

    const [dbCheck, redisCheck] = await Promise.all([checkDatabase(), checkRedis()]);
    checks.push(dbCheck, redisCheck);

    const overallStatus = checks.every((c) => c.status === 'ok') ? 'ok' : 'degraded';
    const statusCode = overallStatus === 'ok' ? 200 : 503;

    const response: HealthCheckResponse = {
      status: overallStatus,
      service: 'auth',
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

  // ── Auth routes ──────────────────────────────────────────
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/users', usersRouter);

  // Global error handler (must be last)
  app.use(createErrorHandler(logger));

  return app;
}\n```\n\n# ФАЙЛ: src/index.ts\n```typescript\n/**
 * Точка входа auth-сервиса.
 * Запускает HTTP-сервер на порту 4001 через createServiceRunner.
 */

import pino from 'pino';
import { createServiceRunner } from '@grandbazar/shared';
import { createApp } from './app.js';

const logger = pino({ level: process.env['LOG_LEVEL'] || 'info' });

const run = createServiceRunner({
  name: 'auth',
  port: parseInt(process.env['AUTH_SERVICE_PORT'] || '4001', 10),
  emoji: '🔐',
  createApp: () => createApp(logger),
});

void run();\n```\n\n# ФАЙЛ: src/middleware/require-auth.ts\n```typescript\n/**
 * Middleware проверки аутентификации на уровне маршрута.
 * Гарантирует наличие req.user (JWT уже провалидирован глобально).
 */

import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '@grandbazar/shared';

/**
 * Route-level middleware that ensures the request has been authenticated.
 * Use on routes that require a valid JWT (logout, me, etc.).
 *
 * The global auth middleware (from @grandbazar/shared) populates `req.user`
 * for non-public paths. This guard is a secondary safety check.
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
    return;
  }
  next();
}\n```\n\n# ФАЙЛ: src/middleware/error-handler.ts\n```typescript\n/**
 * Глобальный обработчик ошибок Express.
 * Обрабатывает JSON parse errors, AppError и неизвестные исключения.
 */

import type { Request, Response, NextFunction } from 'express';
import type { Logger } from 'pino';
import { AppError } from '@grandbazar/shared';

/**
 * Global Express error handler.
 * Handles JSON parse errors, AppError subclasses, and unknown errors.
 */
export function createErrorHandler(logger: Logger) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (err: Error & { type?: string; status?: number }, _req: Request, res: Response, _next: NextFunction): void => {
    // JSON parse error from express.json()
    if (err.type === 'entity.parse.failed') {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_JSON',
          message: 'Invalid JSON in request body',
        },
      });
      return;
    }

    // Our custom AppError hierarchy (ConflictError, UnauthorizedError, etc.)
    if (err instanceof AppError) {
      if (!err.isOperational) {
        logger.error({ err }, 'Non-operational error');
      }
      res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
          ...(err.details ? { details: err.details } : {}),
        },
      });
      return;
    }

    // Unknown / unexpected errors
    logger.error({ err }, 'Unhandled error');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      },
    });
  };
}\n```\n\n# ФАЙЛ: src/middleware/index.ts\n```typescript\n/**
 * Реэкспорт middleware auth-сервиса.
 */

export { createErrorHandler } from './error-handler.js';
export { requireAuth } from './require-auth.js';\n```\n\n# ФАЙЛ: src/config/index.ts\n```typescript\n/**
 * Конфигурация auth-сервиса.
 * JWT-секреты, bcrypt, Redis, OAuth-провайдеры (Telegram, VK, Yandex, Sber).
 */

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value) return value;
  const env = process.env['NODE_ENV'];
  // Return fallback in dev/test mode OR if fallback is provided and NODE_ENV is not production
  if (fallback !== undefined && env !== 'production') return fallback;
  throw new Error(`${name} environment variable is required`);
}

function optionalEnv(name: string, fallback?: string): string | undefined {
  return process.env[name] || fallback;
}

export const config = {
  jwt: {
    secret: process.env['JWT_SECRET'] || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('JWT_SECRET is required in production') })() : 'dev-secret-change-me'),
    refreshSecret: process.env['JWT_REFRESH_SECRET'] || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('JWT_REFRESH_SECRET is required in production') })() : 'dev-refresh-secret-change-me'),
    accessExpiresIn: 15 * 60, // 15 minutes in seconds
    refreshExpiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
  },
  bcrypt: {
    saltRounds: 12,
  },
  redis: {
    url: process.env['REDIS_URL'] || 'redis://localhost:6379',
  },
  // ═══════════════════════════════════════════════════════════
  // Social Auth (152-ФЗ compliant providers)
  // ═══════════════════════════════════════════════════════════
  telegram: {
    botToken: requireEnv('TELEGRAM_BOT_TOKEN', 'dev-telegram-bot-token'),
  },
  vk: {
    clientId: optionalEnv('VK_CLIENT_ID', 'dev-vk-client-id') || '',
    clientSecret: optionalEnv('VK_CLIENT_SECRET', 'dev-vk-client-secret') || '',
    redirectUri: optionalEnv('VK_REDIRECT_URI', 'http://localhost:3000/auth/vk/callback') || '',
  },
  yandex: {
    clientId: optionalEnv('YANDEX_CLIENT_ID', 'dev-yandex-client-id') || '',
    clientSecret: optionalEnv('YANDEX_CLIENT_SECRET', 'dev-yandex-client-secret') || '',
    redirectUri: optionalEnv('YANDEX_REDIRECT_URI', 'http://localhost:3000/auth/yandex/callback') || '',
  },
  sber: {
    clientId: optionalEnv('SBER_CLIENT_ID'),
    clientSecret: optionalEnv('SBER_CLIENT_SECRET'),
    // TODO: Add when implementing Sber ID OAuth
  },
} as const;\n```\n\n# ФАЙЛ: src/validators/auth.validators.ts\n```typescript\n/**
 * Zod-схемы валидации для auth-эндпоинтов.
 * Register, login, refresh, OAuth (Telegram, VK, Yandex, Sber).
 */

import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be at most 100 characters')
    .trim(),
  tenantName: z.string().min(1).max(100).trim().optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// ═══════════════════════════════════════════════════════════
// Social Auth Validators (152-ФЗ compliant)
// ═══════════════════════════════════════════════════════════

/**
 * Telegram Login Widget validator
 * Spec: https://core.telegram.org/widgets/login
 */
export const telegramLoginSchema = z.object({
  id: z.number().int().positive(),
  first_name: z.string().min(1).max(100),
  last_name: z.string().max(100).optional(),
  username: z.string().max(32).optional(),
  photo_url: z.string().url().optional(),
  auth_date: z.number().int().positive(),
  hash: z.string().length(64), // SHA-256 hash in hex = 64 chars
});

/**
 * VK ID OAuth validator
 * Spec: https://dev.vk.com/ru/api/oauth/getting-started
 */
export const vkLoginSchema = z.object({
  code: z.string().min(1),
  redirect_uri: z.string().url(),
});

/**
 * Yandex ID OAuth validator
 * Spec: https://yandex.ru/dev/id/doc/ru/
 */
export const yandexLoginSchema = z.object({
  code: z.string().min(1),
  redirect_uri: z.string().url(),
});

/**
 * Sber ID OAuth validator
 * Spec: https://developer.sber.ru/doc/ru/sber-id/oauth
 */
export const sberLoginSchema = z.object({
  code: z.string().min(1),
  redirect_uri: z.string().url(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type TelegramLoginInput = z.infer<typeof telegramLoginSchema>;
export type VkLoginInput = z.infer<typeof vkLoginSchema>;
export type YandexLoginInput = z.infer<typeof yandexLoginSchema>;
export type SberLoginInput = z.infer<typeof sberLoginSchema>;\n```\n\n# ФАЙЛ: src/routes/internal.ts\n```typescript\n/**
 * Internal API для межсервисного взаимодействия.
 * Защищён X-Internal-Key (не JWT). Поиск/создание пользователей по Telegram ID.
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { getDbClient } from '@grandbazar/database';
import { slugify } from '@grandbazar/shared';
import { generateTokens } from '../services/token.service.js';
import type { UserRole } from '@grandbazar/shared';

const router = Router();

/**
 * Internal API for service-to-service communication.
 * Protected by INTERNAL_API_KEY header, not JWT.
 */

// Middleware: verify internal API key
router.use((req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-internal-key'];
  const expectedKey = process.env['INTERNAL_API_KEY'] || 'grandhub-internal-dev';
  
  if (apiKey !== expectedKey) {
    res.status(401).json({ error: 'Invalid internal API key' });
    return;
  }
  next();
});

/**
 * POST /internal/users/telegram
 * Find or create user by Telegram ID (no hash verification — trusted service call)
 */
router.post('/users/telegram', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { telegramId, firstName, lastName, username: _username, photoUrl } = req.body;

    if (!telegramId) {
      res.status(400).json({ error: 'telegramId is required' });
      return;
    }

    const prisma = getDbClient();
    const tgId = telegramId.toString();

    // Try to find existing user
    let user = await prisma.user.findUnique({
      where: { telegramId: tgId },
      include: {
        memberships: {
          include: { tenant: true },
          take: 1,
          orderBy: { createdAt: 'asc' as const },
        },
      },
    });

    if (user) {
      // Update lastLoginAt
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      const membership = user.memberships[0];
      const tokens = membership
        ? await generateTokens({
            id: user.id,
            email: user.email ?? undefined,
            tenantId: membership.tenantId,
            roles: [membership.role] as UserRole[],
          })
        : null;

      res.json({
        user: {
          id: user.id,
          telegramId: user.telegramId,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl,
          plan: membership?.tenant?.plan || 'FREE',
          isNew: false,
        },
        tokens,
      });
      return;
    }

    // Create new user
    const name = [firstName, lastName].filter(Boolean).join(' ') || 'User';
    const tenantName = `${name}'s Space`;
    const slug = slugify(tenantName) + '-' + Date.now().toString(36);

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: tenantName,
          slug,
          plan: 'FREE',
        },
      });

      const newUser = await tx.user.create({
        data: {
          telegramId: tgId,
          authProvider: 'TELEGRAM',
          name,
          avatarUrl: photoUrl,
        },
      });

      await tx.tenantMember.create({
        data: {
          tenantId: tenant.id,
          userId: newUser.id,
          role: 'OWNER',
        },
      });

      return { user: newUser, tenant };
    });

    const tokens = await generateTokens({
      id: result.user.id,
      email: result.user.email ?? undefined,
      tenantId: result.tenant.id,
      roles: ['OWNER'] as UserRole[],
    });

    res.status(201).json({
      user: {
        id: result.user.id,
        telegramId: result.user.telegramId,
        name: result.user.name,
        email: result.user.email,
        avatarUrl: result.user.avatarUrl,
        plan: 'FREE',
        isNew: true,
      },
      tokens,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /internal/users/telegram/:telegramId
 * Find user by Telegram ID
 */
router.get('/users/telegram/:telegramId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getDbClient();
    const user = await prisma.user.findUnique({
      where: { telegramId: req.params['telegramId'] },
      include: {
        memberships: {
          include: { tenant: true },
          take: 1,
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const membership = user.memberships[0];
    res.json({
      id: user.id,
      telegramId: user.telegramId,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      plan: membership?.tenant?.plan || 'FREE',
      createdAt: user.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

export { router as internalRouter };\n```\n\n# ФАЙЛ: src/routes/auth.ts\n```typescript\n/**
 * Маршруты аутентификации: register, login, logout, refresh, OAuth (Telegram, VK, Yandex, Sber).
 * Публичные эндпоинты — не требуют JWT.
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '@grandbazar/shared';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  telegramLoginSchema,
  vkLoginSchema,
  yandexLoginSchema,
  sberLoginSchema,
} from '../validators/auth.validators.js';
import * as authService from '../services/auth.service.js';
import * as telegramService from '../services/telegram.service.js';
import * as vkService from '../services/vk.service.js';
import * as yandexService from '../services/yandex.service.js';

const router = Router();

/**
 * POST /auth/register
 * Create new user + tenant. Returns JWT + refresh token.
 * Public — no auth required.
 */
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        },
      });
      return;
    }

    const tokens = await authService.register(parsed.data);
    res.status(201).json({ success: true, data: tokens });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /auth/login
 * Authenticate by email + password. Returns JWT + refresh token.
 * Public — no auth required.
 */
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        },
      });
      return;
    }

    const tokens = await authService.login(parsed.data);
    res.status(200).json({ success: true, data: tokens });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /auth/refresh
 * Exchange a valid refresh token for a new token pair.
 * Public — no auth required (uses refresh token from body).
 */
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        },
      });
      return;
    }

    const tokens = await authService.refresh(parsed.data.refreshToken);
    res.status(200).json({ success: true, data: tokens });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /auth/logout
 * Invalidate the current user's refresh token in Redis.
 * Protected — requires valid JWT.
 */
router.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
      return;
    }

    await authService.logout(authReq.user.sub);
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /auth/me
 * Return the current user's profile (derived from JWT).
 * Protected — requires valid JWT.
 */
router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
      return;
    }

    const profile = await authService.getProfile(authReq.user.sub);
    res.status(200).json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
});

// ════════════════════════════════════════════════════════════
// Social Auth Routes (152-ФЗ compliant)
// ════════════════════════════════════════════════════════════

/**
 * POST /auth/telegram
 * Authenticate via Telegram Login Widget.
 * Auto-registers new users. Returns JWT + refresh token.
 * Public — no auth required.
 */
router.post('/telegram', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = telegramLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        },
      });
      return;
    }

    const tokens = await telegramService.loginOrRegisterWithTelegram(parsed.data);
    res.status(200).json({ success: true, data: tokens });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /auth/vk
 * Authenticate via VK ID (OAuth 2.0).
 * Accepts code + redirect_uri from the frontend OAuth flow.
 * Auto-registers new users. Returns JWT + refresh token.
 * Public — no auth required.
 */
router.post('/vk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = vkLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        },
      });
      return;
    }

    const tokens = await vkService.loginOrRegisterWithVK(parsed.data.code, parsed.data.redirect_uri);
    res.status(200).json({ success: true, data: tokens });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /auth/yandex
 * Authenticate via Yandex ID (OAuth 2.0).
 * Accepts code from the frontend OAuth flow.
 * Auto-registers new users. Returns JWT + refresh token.
 * Public — no auth required.
 */
router.post('/yandex', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = yandexLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        },
      });
      return;
    }

    const tokens = await yandexService.loginOrRegisterWithYandex(parsed.data.code);
    res.status(200).json({ success: true, data: tokens });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /auth/sber
 * Authenticate via Sber ID (OAuth 2.0).
 * TODO: Implement Sber OAuth flow.
 * Public — no auth required.
 */
router.post('/sber', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = sberLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        },
      });
      return;
    }

    // TODO: Implement Sber ID OAuth flow
    // 1. Exchange code for access_token via https://api.sberbank.ru/oauth2/token
    // 2. Fetch user info via https://api.sberbank.ru/userinfo
    // 3. Find or create user with sberId
    // 4. Return JWT tokens
    res.status(501).json({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Sber ID authentication is not yet implemented',
      },
    });
  } catch (err) {
    next(err);
  }
});

export { router as authRouter };\n```\n\n# ФАЙЛ: src/routes/users.ts\n```typescript\n/**
 * Маршруты пользователей: публичный профиль, обновление профиля, смена пароля.
 * Часть эндпоинтов требует JWT-аутентификации.
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '@grandbazar/shared';
import { requireAuth } from '../middleware/require-auth.js';
import * as userService from '../services/user.service.js';

const router = Router();

/**
 * GET /users/:id/public
 * Get public user profile (no auth required)
 */
router.get('/:id/public', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.params["id"] as string;
    const profile = await userService.getPublicProfile(userId);
    
    if (!profile) {
      res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
      return;
    }

    res.status(200).json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /users/:id/skills
 * Get user's published skills (no auth required)
 */
router.get('/:id/skills', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.params["id"] as string;
    const skills = await userService.getUserSkills(userId);
    
    res.status(200).json({ success: true, data: skills });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /users/by-username/:username
 * Get user by username (for /users/[username] route)
 */
router.get('/by-username/:username', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const username = req.params["username"] as string;
    const profile = await userService.getPublicProfileByUsername(username);
    
    if (!profile) {
      res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
      return;
    }

    res.status(200).json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /users/me/profile
 * Update current user's profile (requires auth)
 */
router.patch('/me/profile', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.sub;
    const { bio, website, github, twitter, name, avatarUrl } = req.body;
    
    const updatedUser = await userService.updateProfile(userId, {
      bio,
      website,
      github,
      twitter,
      name,
      avatarUrl,
    });
    
    res.status(200).json({ success: true, data: updatedUser });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /users/me
 * Get current user's full profile (requires auth)
 */
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.sub;
    const profile = await userService.getFullProfile(userId);
    
    if (!profile) {
      res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
      return;
    }

    res.status(200).json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
});

export default router;\n```\n