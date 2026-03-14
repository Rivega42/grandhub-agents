# СИСТЕМНЫЙ КОНТЕКСТ
Ты — Coder агент GrandHub. Твоя задача: реализовать код строго по TaskSpec.
Работай только в пределах file_scope. Запускай eval-loop.sh после каждого изменения.
\n# TASK SPEC\n{
  "task_id": "TASK-20260314-GH28",
  "title": "fix(gha): сбрасывать running задачи в pending при старте оркестратора",
  "description": "GitHub Issue #28: fix(gha): сбрасывать running задачи в pending при старте оркестратора\n\nПри рестарте orc задачи в статусе running зависают навечно. Нужно при старте сбрасывать их в pending.\n\nФайл: agents/orchestrator.ts — в начале после загрузки queue.json добавить цикл: если entry.status === running, то entry.status = pending, entry.started_at = undefined. Логировать: Recovering stuck task.\n\nallow_test_failure: true\n\nКритерии: при рестарте running задачи становятся pending и перезапускаются. TypeScript компилируется.",
  "service": "api-gateway",
  "type": "fix",
  "priority": "medium",
  "file_scope": [],
  "acceptance_criteria": [
    "Проблема из issue #28 устранена",
    "typecheck проходит без ошибок",
    "lint проходит без ошибок"
  ],
  "allow_test_failure": false,
  "max_retries": 3,
  "escalation_threshold": 2,
  "timeout_minutes": 30,
  "cost_budget_usd": 2,
  "created_at": "2026-03-14T15:51:38.914Z",
  "github_issue": {
    "number": 28,
    "url": "https://github.com/Rivega42/grandhub-feedback/issues/28",
    "author": "Rivega42"
  }
}\n\n# AGENT.md — api-gateway\n# AGENT.md — api-gateway (API Gateway)

> Этот файл предназначен для AI-агентов. Прочитай его полностью перед работой с сервисом.

## Назначение

Единая точка входа для всех внешних запросов к GrandHub. Проксирует запросы к внутренним сервисам, обеспечивает rate limiting, CORS, безопасность. Не содержит бизнес-логики.

## Технологии

- **Язык:** TypeScript 5.x
- **Framework:** Express.js
- **Прокси:** `http-proxy-middleware`
- **Безопасность:** helmet, cors, express-rate-limit
- **Логирование:** Pino + pino-http
- **Трассировка:** OpenTelemetry
- **Тесты:** Vitest
- **Сборка:** tsc -b

## Точки входа

- `src/index.ts` — запуск сервиса (порт `API_GATEWAY_PORT` или **4000**)
- `src/app.ts` — Express приложение, прокси-маршруты, health check

## Маршруты (проксирование)

| Путь | Целевой сервис | Порт |
|------|---------------|------|
| `/auth/*` | auth | 4001 |
| `/api/assistants/*` | assistant-runtime | 4005 |
| `/api/billing/*` | billing | 4003 |
| `/api/*` | api-v3 | 4002 |
| `/health` | (локально) | — |

## Подводные камни

- ⚠️ **Не добавляй бизнес-логику** — это только прокси. Вся логика в upstream-сервисах
- ⚠️ **CORS Origins** — разрешённые домены задаются через `CORS_ORIGIN` (через запятую). Не хардкодить
- ⚠️ **Rate limit** — `RATE_LIMIT_MAX_REQUESTS=100` за `RATE_LIMIT_WINDOW_MS=60000` мс. Глобальный для всех маршрутов
- ⚠️ **WebSocket** — не проксируется здесь, websocket-сервис на отдельном порту 4014
- ⚠️ **`createErrorHandler`** — импортируется из `@grandbazar/shared`, не переписывать локально
- ⚠️ **`changeOrigin: true`** — обязательно в proxy middleware, иначе upstream отклонит запрос

## Как запустить локально

```bash
cd /opt/grandhub-v3/services/api-gateway
pnpm dev      # dev режим с hot reload
pnpm build    # сборка tsc -b
pnpm start    # запуск dist/index.js
pnpm test     # тесты vitest
pnpm lint     # ESLint
pnpm typecheck # tsc --noEmit
```

## Переменные окружения

| Переменная | Описание | Пример | Обязательная |
|-----------|---------|--------|-------------|
| `API_GATEWAY_PORT` | Порт сервиса | `4000` | ✅ |
| `AUTH_SERVICE_URL` | URL auth-сервиса | `http://localhost:4001` | ✅ |
| `ASSISTANT_RUNTIME_URL` | URL assistant-runtime | `http://localhost:4005` | ✅ |
| `BILLING_SERVICE_URL` | URL billing-сервиса | `http://localhost:4003` | ✅ |
| `API_V3_URL` | URL api-v3 | `http://localhost:4002` | ✅ |
| `CORS_ORIGIN` | Разрешённые origins | `https://grandhub.ru,http://localhost:3000` | ✅ |
| `RATE_LIMIT_WINDOW_MS` | Окно rate limit (мс) | `60000` | ⬜ |
| `RATE_LIMIT_MAX_REQUESTS` | Макс запросов за окно | `100` | ⬜ |
| `REDIS_URL` | Redis для rate limit | `redis://localhost:6379` | ⬜ |
| `NODE_ENV` | Окружение | `production` | ✅ |

## Зависимости от других сервисов

- Зависит от: auth (4001), assistant-runtime (4005), billing (4003), api-v3 (4002)
- Нужен для: фронтенд, мобильные приложения, внешние клиенты\n\n# ФАЙЛ: src/app.ts\n```typescript\nimport express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createProxyMiddleware } from 'http-proxy-middleware';
import pinoHttp from 'pino-http';
import type { Logger } from 'pino';
import type { HealthCheckResponse } from '@grandbazar/shared';
import { createErrorHandler } from '@grandbazar/shared';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequestLogger } from './middleware/request-logger.js';

const startTime = Date.now();

// Read version from package.json
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'),
) as { version: string };
const SERVICE_VERSION = packageJson.version;

type ServiceStatus = 'ok' | 'unreachable';

interface ServiceHealthResult {
  auth: ServiceStatus;
  assistantRuntime: ServiceStatus;
  skillRegistry: ServiceStatus;
}

async function checkServiceHealth(url: string, timeoutMs = 3000): Promise<ServiceStatus> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`${url}/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok ? 'ok' : 'unreachable';
  } catch {
    return 'unreachable';
  }
}

export function createApp(logger: Logger): express.Application {
  const app = express();

  // Security
  app.use(helmet());

  // CORS — allow frontend origins
  const defaultOrigins = [
    'http://localhost:3000',
    'http://185.23.239.126:3380',
  ];
  const envOrigins = (process.env['CORS_ORIGIN'] ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl)
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(null, false);
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    }),
  );

  // Rate limiting
  app.use(
    rateLimit({
      windowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] ?? '60000', 10),
      max: parseInt(process.env['RATE_LIMIT_MAX_REQUESTS'] ?? '100', 10),
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  // Body parsing (for non-proxied routes)
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Request logging (pino-http for dev, custom for structured logs)
  app.use(pinoHttp({ logger }));

  // Custom request logger middleware
  app.use(createRequestLogger(logger));

  // Service URLs
  const AUTH_SERVICE_URL = process.env['AUTH_SERVICE_URL'] ?? 'http://auth:4001';
  const ASSISTANT_RUNTIME_URL = process.env['ASSISTANT_RUNTIME_URL'] ?? 'http://assistant-runtime:4005';
  const SKILL_REGISTRY_URL = process.env['SKILL_REGISTRY_URL'] ?? 'http://skill-registry:4003';

  // ─── Health check ───────────────────────────────────────────────
  app.get('/health', async (_req, res) => {
    // Check downstream services in parallel
    const [authStatus, assistantRuntimeStatus, skillRegistryStatus] = await Promise.all([
      checkServiceHealth(AUTH_SERVICE_URL),
      checkServiceHealth(ASSISTANT_RUNTIME_URL),
      checkServiceHealth(SKILL_REGISTRY_URL),
    ]);

    const services: ServiceHealthResult = {
      auth: authStatus,
      assistantRuntime: assistantRuntimeStatus,
      skillRegistry: skillRegistryStatus,
    };

    // Build checks array for HealthCheckResponse compatibility
    const checks: Array<{ name: string; status: 'ok' | 'error'; message?: string }> = [
      { name: 'self', status: 'ok' },
      { name: 'auth', status: authStatus === 'ok' ? 'ok' : 'error', ...(authStatus !== 'ok' && { message: 'Auth service unreachable' }) },
      { name: 'assistantRuntime', status: assistantRuntimeStatus === 'ok' ? 'ok' : 'error', ...(assistantRuntimeStatus !== 'ok' && { message: 'Assistant runtime unreachable' }) },
      { name: 'skillRegistry', status: skillRegistryStatus === 'ok' ? 'ok' : 'error', ...(skillRegistryStatus !== 'ok' && { message: 'Skill registry unreachable' }) },
    ];

    // Check Redis connectivity
    if (process.env['REDIS_URL']) {
      try {
        const net = await import('node:net');
        const url = new URL(process.env['REDIS_URL']);
        await new Promise<void>((resolve, reject) => {
          const socket = net.createConnection(
            { host: url.hostname, port: parseInt(url.port || '6379', 10), timeout: 2000 },
            () => {
              socket.destroy();
              resolve();
            },
          );
          socket.on('error', reject);
          socket.on('timeout', () => {
            socket.destroy();
            reject(new Error('Connection timeout'));
          });
        });
        checks.push({ name: 'redis', status: 'ok' });
      } catch {
        checks.push({ name: 'redis', status: 'error', message: 'Redis unreachable' });
      }
    }

    const allServicesOk = authStatus === 'ok' && assistantRuntimeStatus === 'ok' && skillRegistryStatus === 'ok';
    const overallStatus = allServicesOk && checks.every((c) => c.status === 'ok') ? 'ok' : 'degraded';
    const statusCode = overallStatus === 'ok' ? 200 : 503;

    const response: HealthCheckResponse & { services: ServiceHealthResult } = {
      status: overallStatus,
      service: 'api-gateway',
      version: SERVICE_VERSION,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
      checks,
      services,
    };
    res.status(statusCode).json(response);
  });

  // Ready check (for k8s)
  app.get('/ready', (_req, res) => {
    res.json({ ready: true });
  });

  // ─── Proxy routes to downstream services ────────────────────────

  const AGENT_SERVICE_URL = process.env['AGENT_SERVICE_URL'] ?? 'http://agent-orchestrator:4002';
  const SKILL_SERVICE_URL = process.env['SKILL_SERVICE_URL'] ?? 'http://skill-registry:4003';

  // Auth service proxy: /api/v1/auth/* → auth:4001
  app.use(
    '/api/v1/auth',
    createProxyMiddleware({
      target: AUTH_SERVICE_URL,
      changeOrigin: true,
      pathRewrite: { '^/api/v1/auth': '/api/v1/auth' },
      on: {
        proxyReq: (_proxyReq, req) => {
          logger.debug({ target: AUTH_SERVICE_URL, path: req.url }, 'proxy → auth');
        },
        error: (err, _req, res) => {
          logger.error({ err }, 'auth proxy error');
          if ('writeHead' in res && typeof res.writeHead === 'function') {
            (res as express.Response).status(502).json({
              success: false,
              error: { code: 'SERVICE_UNAVAILABLE', message: 'Auth service unavailable' },
            });
          }
        },
      },
    }),
  );

  // Agent orchestrator proxy: /api/v1/agents/* → agent-orchestrator:4002
  app.use(
    '/api/v1/agents',
    createProxyMiddleware({
      target: AGENT_SERVICE_URL,
      changeOrigin: true,
      pathRewrite: { '^/api/v1/agents': '/api/v1/agents' },
      on: {
        proxyReq: (_proxyReq, req) => {
          logger.debug({ target: AGENT_SERVICE_URL, path: req.url }, 'proxy → agent-orchestrator');
        },
        error: (err, _req, res) => {
          logger.error({ err }, 'agent proxy error');
          if ('writeHead' in res && typeof res.writeHead === 'function') {
            (res as express.Response).status(502).json({
              success: false,
              error: { code: 'SERVICE_UNAVAILABLE', message: 'Agent service unavailable' },
            });
          }
        },
      },
    }),
  );

  // Skill registry proxy: /api/v1/skills/* → skill-registry:4003
  app.use(
    '/api/v1/skills',
    createProxyMiddleware({
      target: SKILL_SERVICE_URL,
      changeOrigin: true,
      pathRewrite: { '^/api/v1/skills': '/api/v1/skills' },
      on: {
        proxyReq: (_proxyReq, req) => {
          logger.debug({ target: SKILL_SERVICE_URL, path: req.url }, 'proxy → skill-registry');
        },
        error: (err, _req, res) => {
          logger.error({ err }, 'skill proxy error');
          if ('writeHead' in res && typeof res.writeHead === 'function') {
            (res as express.Response).status(502).json({
              success: false,
              error: { code: 'SERVICE_UNAVAILABLE', message: 'Skill service unavailable' },
            });
          }
        },
      },
    }),
  );

  // ─── API info endpoint ──────────────────────────────────────────
  app.get('/api/v1', (_req, res) => {
    res.json({
      name: 'GrandBazar API',
      version: SERVICE_VERSION,
      docs: '/api/v1/docs',
      services: {
        auth: '/api/v1/auth',
        agents: '/api/v1/agents',
        skills: '/api/v1/skills',
      },
    });
  });

  // Error handling
  app.use(createErrorHandler(logger));

  return app;
}\n```\n\n# ФАЙЛ: src/index.ts\n```typescript\nimport pino from 'pino';
import { createServiceRunner } from '@grandbazar/shared';
import { createApp } from './app.js';

const logger = pino({ level: process.env['LOG_LEVEL'] || 'info' });

const run = createServiceRunner({
  name: 'api-gateway',
  port: parseInt(process.env['API_GATEWAY_PORT'] || '4000', 10),
  emoji: '🚀',
  createApp: () => createApp(logger),
});

void run();\n```\n\n# ФАЙЛ: src/middleware/request-logger.ts\n```typescript\nimport type { Request, Response, NextFunction } from 'express';
import type { Logger } from 'pino';

interface RequestLogEntry {
  ts: string;
  method: string;
  path: string;
  status: number;
  duration_ms: number;
  userId?: string;
  requestBody?: unknown;
  responseBody?: unknown;
}

const SKIP_PATHS = new Set(['/health', '/ready', '/metrics']);

export function createRequestLogger(logger: Logger) {
  return function requestLogger(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    // Skip health/metrics endpoints
    if (SKIP_PATHS.has(req.path)) {
      next();
      return;
    }

    const startTime = Date.now();
    const requestBody = req.body as unknown;

    // Capture response body for error logging
    let responseBody: unknown;
    const originalJson = res.json.bind(res);

    res.json = function (body: unknown): Response {
      responseBody = body;
      return originalJson(body);
    };

    // Log on response finish
    res.on('finish', () => {
      const duration_ms = Date.now() - startTime;
      const status = res.statusCode;

      const logEntry: RequestLogEntry = {
        ts: new Date().toISOString(),
        method: req.method,
        path: req.path,
        status,
        duration_ms,
      };

      // Add userId if present (from auth middleware)
      const userId = (req as Request & { user?: { id?: string } }).user?.id;
      if (userId) {
        logEntry.userId = userId;
      }

      // For errors (4xx/5xx), include request and response bodies
      if (status >= 400) {
        if (requestBody && Object.keys(requestBody as object).length > 0) {
          logEntry.requestBody = requestBody;
        }
        if (responseBody) {
          logEntry.responseBody = responseBody;
        }
        logger.warn(logEntry, 'request error');
      } else {
        logger.info(logEntry, 'request completed');
      }
    });

    next();
  };
}\n```\n