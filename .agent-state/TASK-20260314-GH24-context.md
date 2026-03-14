# СИСТЕМНЫЙ КОНТЕКСТ
Ты — Coder агент GrandHub. Твоя задача: реализовать код строго по TaskSpec.
Работай только в пределах file_scope. Запускай eval-loop.sh после каждого изменения.
\n# TASK SPEC\n{
  "task_id": "TASK-20260314-GH24",
  "title": "feat(skill-registry): endpoint GET /marketplace/trending — топ скиллов",
  "description": "GitHub Issue #24: feat(skill-registry): endpoint GET /marketplace/trending — топ скиллов\n\nДобавить endpoint для получения топ-скиллов по популярности.\n\n## Сервис\nservices/skill-registry/\n\n## Файл\nsrc/routes/skills.ts — добавить в createMarketplaceRouter()\n\n## Что добавить\n\nGET /api/v1/marketplace/trending\nQuery params:\n- limit (default 5, max 20)\n- period: week | month | all (default week)\n\nЛогика для period=week: скиллы с наибольшим ratingAvg + installCount за последние 7 дней.\nДля period=all: просто ORDER BY ratingAvg DESC, installCount DESC.\n\nОтвет: { skills: [...], period: string",
  "service": "skill-registry",
  "type": "feat",
  "priority": "medium",
  "file_scope": [],
  "acceptance_criteria": [
    "Проблема из issue #24 устранена",
    "typecheck проходит без ошибок",
    "lint проходит без ошибок"
  ],
  "allow_test_failure": false,
  "max_retries": 3,
  "escalation_threshold": 2,
  "timeout_minutes": 30,
  "cost_budget_usd": 2,
  "created_at": "2026-03-14T15:36:10.426Z",
  "github_issue": {
    "number": 24,
    "url": "https://github.com/Rivega42/grandhub-feedback/issues/24",
    "author": "Rivega42"
  }
}\n\n# AGENT.md — skill-registry\n⚠️ AGENT.md отсутствует. Изучи код самостоятельно.\n\n# ФАЙЛ: src/app.ts\n```typescript\nimport express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import pinoHttp from 'pino-http';
import type { Logger } from 'pino';
import type { HealthCheckResponse, JwtPayload } from '@grandbazar/shared';
import { createAuthMiddleware, createErrorHandler } from '@grandbazar/shared';
import {
  createSkillRouter,
  createMarketplaceRouter,
  createAgentSkillRouter,
} from './routes/skills.js';

const startTime = Date.now();

/** Check PostgreSQL connectivity via DATABASE_URL (3.5) */
async function checkDatabase(): Promise<{
  name: string;
  status: 'ok' | 'error';
  message?: string;
}> {
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

/** Check Redis connectivity (3.5) */
async function checkRedis(): Promise<{ name: string; status: 'ok' | 'error'; message?: string }> {
  const redisUrl = process.env['REDIS_URL'];
  if (!redisUrl) return { name: 'redis', status: 'error', message: 'REDIS_URL not set' };
  try {
    const net = await import('node:net');
    const url = new URL(redisUrl);
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
        reject(new Error('timeout'));
      });
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

  // JSON parse error handler — must be right after express.json() (3.7)
  app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_JSON', message: 'Invalid JSON in request body' },
      });
      return;
    }
    next(err);
  });

  app.use(pinoHttp({ logger }));

  // Health check (3.5) — before rate limiting and auth
  app.get('/health', ((_req, res) => {
    void (async () => {
      const checks: Array<{ name: string; status: 'ok' | 'error'; message?: string }> = [
        { name: 'self', status: 'ok' },
      ];

      const [dbCheck, redisCheck] = await Promise.all([checkDatabase(), checkRedis()]);
      checks.push(dbCheck, redisCheck);

      const overallStatus = checks.every((c) => c.status === 'ok') ? 'ok' : 'degraded';
      const statusCode = overallStatus === 'ok' ? 200 : 503;

      const response: HealthCheckResponse = {
        status: overallStatus,
        service: 'skill-registry',
        version: '0.1.0',
        uptime: Math.floor((Date.now() - startTime) / 1000),
        timestamp: new Date().toISOString(),
        checks,
      };
      res.status(statusCode).json(response);
    })();
  }) as express.RequestHandler);

  app.get('/ready', (_req, res) => {
    res.json({ ready: true });
  });

  // Rate limiting (3.8)
  app.use(
    rateLimit({
      windowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] ?? '60000', 10),
      max: parseInt(process.env['RATE_LIMIT_MAX_REQUESTS'] ?? '200', 10),
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  // JWT auth — protect all routes except health/ready (already handled above)
  const jwtSecret = process.env['JWT_SECRET'] ?? '';
  app.use((req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const token = authHeader.slice(7);
    try {
      const payload = jwt.verify(token, jwtSecret) as JwtPayload;
      (req as Parameters<typeof createAuthMiddleware>[0] & { user?: JwtPayload }).user = payload;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  });

  // Skill CRUD & reviews
  app.use('/api/v1/skills', createSkillRouter());
  app.use('/api/v1/marketplace', createMarketplaceRouter());

  // Agent skill install/uninstall
  app.use('/api/v1/agents', createAgentSkillRouter());

  app.use(createErrorHandler(logger));

  return app;
}\n```\n\n# ФАЙЛ: src/index.ts\n```typescript\nimport { createServiceRunner } from '@grandbazar/shared';
import { createApp } from './app.js';

const run = createServiceRunner({
  name: 'skill-registry',
  port: 4005,
  portEnv: 'SKILL_REGISTRY_PORT',
  emoji: '🧩',
  createApp,
});

void run();\n```\n\n# ФАЙЛ: src/types/index.ts\n```typescript\n/**
 * TypeScript types for skill-registry service
 * Aligned with Prisma schema (Issue #10: marketplace extension)
 */

// ─── Enums ──────────────────────────────────────────────────────────

export type SkillCategory =
  | 'SHOPPING'
  | 'FINANCE'
  | 'PRODUCTIVITY'
  | 'SMART_HOME'
  | 'COMMUNICATION'
  | 'ANALYTICS'
  | 'INTEGRATION'
  | 'CUSTOM';

export type SkillStatus = 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'DEPRECATED' | 'REJECTED';

// ─── Skill Parameter Schema ─────────────────────────────────────────

export interface SkillParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  default?: unknown;
}

export interface SkillSchema {
  inputs: SkillParameter[];
  outputs: SkillParameter[];
  config: SkillParameter[];
}

// ─── Core Entities ──────────────────────────────────────────────────

export interface Skill {
  id: string;
  authorId: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string;
  longDescription: string;
  category: SkillCategory;
  tags: string[];
  icon: string | null;
  status: SkillStatus;
  isPublic: boolean;
  metadata: Record<string, unknown>;

  // Marketplace fields (Issue #10)
  price: number | null;
  currency: string;
  isFree: boolean;
  downloadCount: number;
  featuredAt: Date | null;
  publishedAt: Date | null;

  // Rating (Issue #18)
  ratingAvg: number;

  createdAt: Date;
  updatedAt: Date;
}

export interface SkillVersion {
  id: string;
  skillId: string;
  version: string;
  changelog: string;
  schema: SkillSchema;
  code: string;
  isLatest: boolean;
  createdAt: Date;
}

export interface SkillReview {
  id: string;
  skillId: string;
  userId: string;
  rating: number;
  title: string;
  comment: string;
  isVerifiedPurchase: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentSkill {
  id: string;
  agentId: string;
  skillId: string;
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SkillPurchase {
  id: string;
  skillId: string;
  userId: string;
  tenantId: string;
  price: number;
  currency: string;
  transactionId: string | null;
  purchasedAt: Date;
}

// ─── API Response Types ─────────────────────────────────────────────

export interface SkillListItem extends Skill {
  latestVersion: string | null;
  avgRating: number;
  reviewCount: number;
  installCount: number;
}

export interface SkillDetail extends Skill {
  versions: SkillVersion[];
  author: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  avgRating: number;
  reviewCount: number;
  installCount: number;
}

export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
}

export interface SkillListResponse {
  success: true;
  data: SkillListItem[];
  meta: PaginationMeta;
}

export interface SkillDetailResponse {
  success: true;
  data: SkillDetail;
}

export interface ReviewListResponse {
  success: true;
  data: SkillReview[];
  meta: PaginationMeta & { avgRating: number };
}

// ─── Request Body Types ─────────────────────────────────────────────

export interface CreateSkillBody {
  name: string;
  description: string;
  longDescription?: string;
  category?: SkillCategory;
  tags?: string[];
  icon?: string;
  isPublic?: boolean;
  metadata?: Record<string, unknown>;
  version?: string;
  schema?: SkillSchema;
  code: string;
}

export interface CreateVersionBody {
  version: string;
  changelog?: string;
  schema?: SkillSchema;
  code: string;
}

export interface CreateReviewBody {
  rating: number;
  title?: string;
  comment?: string;
}

export interface RateSkillBody {
  rating: number;
  comment?: string;
}

export interface InstallSkillBody {
  skillId: string;
  config?: Record<string, unknown>;
}\n```\n\n# ФАЙЛ: src/routes/skills.ts\n```typescript\nimport { Router } from 'express';
import type { Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaClient, Prisma } from '@prisma/client';
import {
  validateRequest,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '@grandbazar/shared';
import type { AuthenticatedRequest } from '@grandbazar/shared';

// ─── Prisma singleton ──────────────────────────────────────────────

let prisma: PrismaClient | undefined;

function db(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log:
        process.env['NODE_ENV'] === 'development'
          ? ['query', 'warn', 'error']
          : ['warn', 'error'],
    });
  }
  return prisma;
}

export async function disconnectSkillDb(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = undefined;
  }
}

// ─── Zod schemas ────────────────────────────────────────────────────

const skillCategoryEnum = z.enum([
  'SHOPPING',
  'FINANCE',
  'PRODUCTIVITY',
  'SMART_HOME',
  'COMMUNICATION',
  'ANALYTICS',
  'INTEGRATION',
  'CUSTOM',
]);

const skillStatusEnum = z.enum([
  'DRAFT',
  'REVIEW',
  'PUBLISHED',
  'DEPRECATED',
  'REJECTED',
]);

const skillParameterSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
  description: z.string(),
  required: z.boolean(),
  default: z.unknown().optional(),
});

const skillSchemaObj = z.object({
  inputs: z.array(skillParameterSchema).default([]),
  outputs: z.array(skillParameterSchema).default([]),
  config: z.array(skillParameterSchema).default([]),
});

const paginationQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .default('20')
    .transform(Number)
    .pipe(z.number().int().min(1).max(100)),
  offset: z
    .string()
    .optional()
    .default('0')
    .transform(Number)
    .pipe(z.number().int().min(0)),
});

const listSkillsQuerySchema = paginationQuerySchema.extend({
  category: skillCategoryEnum.optional(),
  status: skillStatusEnum.optional(),
  search: z.string().max(256).optional(),
});

const idParamSchema = z.object({
  id: z.string().uuid(),
});

const createSkillBodySchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().min(1).max(1024),
  longDescription: z.string().max(8192).optional().default(''),
  category: skillCategoryEnum.optional().default('CUSTOM'),
  tags: z.array(z.string().max(64)).max(20).optional().default([]),
  icon: z.string().url().max(512).optional(),
  isPublic: z.boolean().optional().default(false),
  metadata: z.record(z.unknown()).optional().default({}),
  // Initial version
  version: z.string().min(1).max(32).optional().default('1.0.0'),
  schema: skillSchemaObj.optional().default({ inputs: [], outputs: [], config: [] }),
  code: z.string().min(1).max(1_000_000),
});

const createVersionBodySchema = z.object({
  version: z.string().min(1).max(32),
  changelog: z.string().max(4096).optional().default(''),
  schema: skillSchemaObj.optional().default({ inputs: [], outputs: [], config: [] }),
  code: z.string().min(1).max(1_000_000),
});

const createReviewBodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().max(256).optional().default(''),
  comment: z.string().max(4096).optional().default(''),
});

const rateSkillBodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(4096).optional(),
});

const reviewsQuerySchema = paginationQuerySchema;

const installSkillBodySchema = z.object({
  skillId: z.string().uuid(),
  config: z.record(z.unknown()).optional().default({}),
});

const agentSkillParamsSchema = z.object({
  agentId: z.string().uuid(),
});

const agentSkillDeleteParamsSchema = z.object({
  agentId: z.string().uuid(),
  skillId: z.string().uuid(),
});

// ─── Marketplace query schema ───────────────────────────────────────

const marketplaceQuerySchema = z.object({
  category: skillCategoryEnum.optional(),
  tag: z.string().max(64).optional(),
  q: z.string().max(256).optional(),
  level: z
    .string()
    .optional()
    .transform((val) => (val !== undefined ? parseInt(val, 10) : undefined))
    .pipe(z.number().int().min(0).max(100).optional()),
  limit: z
    .string()
    .optional()
    .default('20')
    .transform(Number)
    .pipe(z.number().int().min(1).max(100)),
  offset: z
    .string()
    .optional()
    .default('0')
    .transform(Number)
    .pipe(z.number().int().min(0)),
});

// ─── Helpers ────────────────────────────────────────────────────────

function getTenantId(req: AuthenticatedRequest): string {
  const tenantId = req.user?.tenantId;
  if (!tenantId) throw new ForbiddenError('No tenantId in token');
  return tenantId;
}

function getUserId(req: AuthenticatedRequest): string {
  // Check x-user-id header first, then JWT sub
  const headerUserId = req.headers['x-user-id'];
  if (typeof headerUserId === 'string' && headerUserId.length > 0) {
    return headerUserId;
  }
  const userId = req.user?.sub;
  if (!userId) throw new ForbiddenError('No userId in token');
  return userId;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 128);
}

// ─── Skill Router ───────────────────────────────────────────────────

export function createSkillRouter(): Router {
  const router = Router();

  // ── 1. GET /skills — list skills with filters ──────────────────
  router.get(
    '/',
    validateRequest({ query: listSkillsQuerySchema }),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const { limit, offset, category, status, search } = req.query as unknown as {
          limit: number;
          offset: number;
          category?: string;
          status?: string;
          search?: string;
        };

        const where: Prisma.SkillWhereInput = {};

        if (category) {
          where.category = category as Prisma.EnumSkillCategoryFilter;
        }
        if (status) {
          where.status = status as Prisma.EnumSkillStatusFilter;
        }
        if (search) {
          where.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ];
        }

        const [skills, total] = await Promise.all([
          db().skill.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: offset,
            take: limit,
            include: {
              _count: { select: { reviews: true, agentSkills: true } },
              versions: {
                where: { isLatest: true },
                select: { version: true },
                take: 1,
              },
            },
          }),
          db().skill.count({ where }),
        ]);

        // Compute average ratings for listed skills
        const skillIds = skills.map((s) => s.id);
        const ratingsAgg =
          skillIds.length > 0
            ? await db().skillReview.groupBy({
                by: ['skillId'],
                where: { skillId: { in: skillIds } },
                _avg: { rating: true },
              })
            : [];

        const ratingsMap = new Map(
          ratingsAgg.map((r) => [r.skillId, r._avg.rating ?? 0]),
        );

        const data = skills.map((skill) => ({
          ...skill,
          latestVersion: skill.versions[0]?.version ?? null,
          versions: undefined,
          avgRating: ratingsMap.get(skill.id) ?? 0,
          reviewCount: skill._count.reviews,
          installCount: skill._count.agentSkills,
        }));

        res.json({
          success: true,
          data,
          meta: { total, limit, offset },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // ── 2. GET /skills/:id — skill details ────────────────────────
  router.get(
    '/:id',
    validateRequest({ params: idParamSchema }),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params as { id: string };

        const skill = await db().skill.findUnique({
          where: { id },
          include: {
            versions: { orderBy: { createdAt: 'desc' } },
            author: { select: { id: true, name: true, avatarUrl: true } },
            _count: { select: { reviews: true, agentSkills: true } },
          },
        });

        if (!skill) throw new NotFoundError('Skill', id);

        const ratingAgg = await db().skillReview.aggregate({
          where: { skillId: id },
          _avg: { rating: true },
          _count: { rating: true },
        });

        res.json({
          success: true,
          data: {
            ...skill,
            avgRating: ratingAgg._avg.rating ?? 0,
            reviewCount: ratingAgg._count.rating,
            installCount: skill._count.agentSkills,
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // ── 3. POST /skills — create (publish) a skill ────────────────
  router.post(
    '/',
    validateRequest({ body: createSkillBodySchema }),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const authorId = getUserId(req);
        const {
          name,
          description,
          longDescription,
          category,
          tags,
          icon,
          isPublic,
          metadata,
          version,
          schema,
          code,
        } = req.body as z.infer<typeof createSkillBodySchema>;

        // Generate unique slug
        let slug = slugify(name);
        const existing = await db().skill.findUnique({ where: { slug } });
        if (existing) {
          slug = `${slug}-${Date.now().toString(36)}`;
        }

        const skill = await db().$transaction(async (tx) => {
          const created = await tx.skill.create({
            data: {
              authorId,
              tenantId,
              name,
              slug,
              description,
              longDescription,
              category,
              tags,
              icon,
              status: 'DRAFT',
              isPublic,
              metadata: metadata as Prisma.InputJsonValue,
            },
          });

          await tx.skillVersion.create({
            data: {
              skillId: created.id,
              version,
              changelog: 'Initial version',
              schema: schema as unknown as Prisma.InputJsonValue,
              code,
              isLatest: true,
            },
          });

          return tx.skill.findUnique({
            where: { id: created.id },
            include: {
              versions: true,
            },
          });
        });

        res.status(201).json({
          success: true,
          data: skill,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // ── 4. PUT /skills/:id/versions — upload new version ──────────
  router.put(
    '/:id/versions',
    validateRequest({ params: idParamSchema, body: createVersionBodySchema }),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const userId = getUserId(req);
        const { id } = req.params as { id: string };
        const { version, changelog, schema, code } = req.body as z.infer<
          typeof createVersionBodySchema
        >;

        const skill = await db().skill.findUnique({ where: { id } });
        if (!skill) throw new NotFoundError('Skill', id);

        // Only the author or same tenant can upload versions
        if (skill.authorId !== userId && skill.tenantId !== tenantId) {
          throw new ForbiddenError('You are not authorized to update this skill');
        }

        // Check for duplicate version
        const existingVersion = await db().skillVersion.findUnique({
          where: { skillId_version: { skillId: id, version } },
        });
        if (existingVersion) {
          throw new ConflictError(`Version '${version}' already exists for this skill`);
        }

        const newVersion = await db().$transaction(async (tx) => {
          // Unset previous latest
          await tx.skillVersion.updateMany({
            where: { skillId: id, isLatest: true },
            data: { isLatest: false },
          });

          return tx.skillVersion.create({
            data: {
              skillId: id,
              version,
              changelog,
              schema: schema as unknown as Prisma.InputJsonValue,
              code,
              isLatest: true,
            },
          });
        });

        res.status(201).json({
          success: true,
          data: newVersion,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // ── 5. POST /skills/:id/reviews — leave a review ─────────────
  router.post(
    '/:id/reviews',
    validateRequest({ params: idParamSchema, body: createReviewBodySchema }),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const userId = getUserId(req);
        const { id: skillId } = req.params as { id: string };
        const { rating, title, comment } = req.body as z.infer<typeof createReviewBodySchema>;

        // Check skill exists
        const skill = await db().skill.findUnique({ where: { id: skillId } });
        if (!skill) throw new NotFoundError('Skill', skillId);

        // Check if user already reviewed
        const existingReview = await db().skillReview.findUnique({
          where: { skillId_userId: { skillId, userId } },
        });
        if (existingReview) {
          throw new ConflictError('You have already reviewed this skill');
        }

        // Check if this is a verified install
        const hasInstall = await db().agentSkill.findFirst({
          where: {
            skillId,
            agent: { tenantId: req.user?.tenantId },
          },
        });

        const review = await db().skillReview.create({
          data: {
            skillId,
            userId,
            rating,
            title,
            comment,
            isVerifiedPurchase: !!hasInstall,
          },
        });

        res.status(201).json({
          success: true,
          data: review,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // ── 6. GET /skills/:id/reviews — list reviews ────────────────
  router.get(
    '/:id/reviews',
    validateRequest({ params: idParamSchema, query: reviewsQuerySchema }),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const { id: skillId } = req.params as { id: string };
        const { limit, offset } = req.query as unknown as { limit: number; offset: number };

        // Check skill exists
        const skill = await db().skill.findUnique({ where: { id: skillId } });
        if (!skill) throw new NotFoundError('Skill', skillId);

        const [reviews, total] = await Promise.all([
          db().skillReview.findMany({
            where: { skillId },
            orderBy: { createdAt: 'desc' },
            skip: offset,
            take: limit,
            include: {
              user: { select: { id: true, name: true, avatarUrl: true } },
            },
          }),
          db().skillReview.count({ where: { skillId } }),
        ]);

        // Aggregate rating stats
        const ratingAgg = await db().skillReview.aggregate({
          where: { skillId },
          _avg: { rating: true },
        });

        res.json({
          success: true,
          data: reviews,
          meta: {
            total,
            limit,
            offset,
            avgRating: ratingAgg._avg.rating ?? 0,
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}

// ─── Agent Skill Router (install/uninstall) ─────────────────────────

export function createAgentSkillRouter(): Router {
  const router = Router();

  // ── 7. POST /agents/:agentId/skills/install — install skill ───
  router.post(
    '/:agentId/skills/install',
    validateRequest({ params: agentSkillParamsSchema, body: installSkillBodySchema }),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { agentId } = req.params as { agentId: string };
        const { skillId, config } = req.body as z.infer<typeof installSkillBodySchema>;

        // Verify agent belongs to tenant
        const agent = await db().agent.findFirst({
          where: { id: agentId, tenantId },
        });
        if (!agent) throw new NotFoundError('Agent', agentId);

        // Verify skill exists
        const skill = await db().skill.findUnique({ where: { id: skillId } });
        if (!skill) throw new NotFoundError('Skill', skillId);

        // Check if already installed
        const existing = await db().agentSkill.findUnique({
          where: { agentId_skillId: { agentId, skillId } },
        });
        if (existing) {
          throw new ConflictError('This skill is already installed on this agent');
        }

        const agentSkill = await db().agentSkill.create({
          data: {
            agentId,
            skillId,
            config: config as Prisma.InputJsonValue,
          },
          include: {
            skill: {
              select: { id: true, name: true, slug: true, category: true },
            },
          },
        });

        res.status(201).json({
          success: true,
          data: agentSkill,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // ── 8. DELETE /agents/:agentId/skills/:skillId — uninstall ────
  router.delete(
    '/:agentId/skills/:skillId',
    validateRequest({ params: agentSkillDeleteParamsSchema }),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { agentId, skillId } = req.params as { agentId: string; skillId: string };

        // Verify agent belongs to tenant
        const agent = await db().agent.findFirst({
          where: { id: agentId, tenantId },
        });
        if (!agent) throw new NotFoundError('Agent', agentId);

        // Verify install exists
        const agentSkill = await db().agentSkill.findUnique({
          where: { agentId_skillId: { agentId, skillId } },
        });
        if (!agentSkill) {
          throw new NotFoundError('AgentSkill', `${agentId}/${skillId}`);
        }

        await db().agentSkill.delete({
          where: { agentId_skillId: { agentId, skillId } },
        });

        res.json({
          success: true,
          data: { message: 'Skill uninstalled successfully' },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}

// ─── Marketplace extra routes ────────────────────────────────────────

export function createMarketplaceRouter(): Router {
  const router = Router();

  // GET /api/v1/marketplace — публичные скиллы с фильтрами
  router.get(
    '/',
    validateRequest({ query: marketplaceQuerySchema }),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const { category, tag, q, level, limit, offset } = req.query as unknown as {
          category?: string;
          tag?: string;
          q?: string;
          level?: number;
          limit: number;
          offset: number;
        };

        const where: Prisma.SkillWhereInput = {
          status: 'PUBLISHED',
          isPublic: true,
        };

        // category — точное совпадение
        if (category) {
          where.category = category as Prisma.EnumSkillCategoryFilter;
        }

        // tag — массив tags содержит это значение
        if (tag) {
          where.tags = { has: tag };
        }

        // level — числовой фильтр
        if (level !== undefined) {
          where.level = level;
        }

        // q — поиск по name и description (case-insensitive, contains)
        if (q) {
          where.OR = [
            { name: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ];
        }

        const [skills, total] = await Promise.all([
          db().skill.findMany({
            where,
            take: limit,
            skip: offset,
            orderBy: { downloadCount: 'desc' },
          }),
          db().skill.count({ where }),
        ]);

        res.json({
          success: true,
          data: { skills, total },
          meta: { total, limit, offset },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /api/v1/marketplace/:id/rate — rate a skill (1-5 stars)
  router.post(
    '/:id/rate',
    validateRequest({ params: idParamSchema, body: rateSkillBodySchema }),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const { id: skillId } = req.params as { id: string };
        const userId = getUserId(req);
        const { rating, comment } = req.body as z.infer<typeof rateSkillBodySchema>;

        // Check skill exists
        const skill = await db().skill.findUnique({ where: { id: skillId } });
        if (!skill) throw new NotFoundError('Skill', skillId);

        // Upsert review and recalculate ratingAvg in transaction
        const review = await db().$transaction(async (tx) => {
          // Upsert the review
          const upsertedReview = await tx.skillReview.upsert({
            where: { skillId_userId: { skillId, userId } },
            create: {
              skillId,
              userId,
              rating,
              title: '',
              comment: comment ?? '',
              isVerifiedPurchase: false,
            },
            update: {
              rating,
              comment: comment ?? '',
            },
          });

          // Recalculate average rating
          const avgResult = await tx.skillReview.aggregate({
            where: { skillId },
            _avg: { rating: true },
          });

          // Update skill's ratingAvg
          await tx.skill.update({
            where: { id: skillId },
            data: { ratingAvg: avgResult._avg.rating ?? 0 },
          });

          return upsertedReview;
        });

        res.json({
          success: true,
          data: review,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /api/v1/marketplace/:id/install
  router.post(
    '/:id/install',
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const userId = req.user?.sub;
        if (!userId) {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }

        const skill = await db().skill.findUnique({ where: { id } });
        if (!skill) {
          res.status(404).json({ error: 'Skill not found' });
          return;
        }

        await db().skill.update({
          where: { id },
          data: { downloadCount: { increment: 1 } },
        });
        res.json({ success: true, data: { message: 'Skill installed' } });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /api/v1/marketplace/:id/publish
  router.post(
    '/:id/publish',
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const userId = req.user?.sub;
        if (!userId) {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }

        const skill = await db().skill.findFirst({ where: { id, authorId: userId } });
        if (!skill) {
          res.status(404).json({ error: 'Skill not found or not owned' });
          return;
        }

        const updated = await db().skill.update({
          where: { id },
          data: { status: 'REVIEW', isPublic: false },
        });
        res.json({ success: true, data: updated });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /api/v1/marketplace/my
  router.get(
    '/my',
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const userId = req.user?.sub;
        if (!userId) {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }
        const skills = await db().skill.findMany({
          where: { authorId: userId },
          orderBy: { createdAt: 'desc' },
        });
        res.json({ success: true, data: skills });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /api/v1/marketplace/developer/stats
  router.get(
    '/developer/stats',
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const userId = req.user?.sub;
        if (!userId) {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }
        const skills = await db().skill.findMany({
          where: { authorId: userId },
          select: {
            id: true,
            name: true,
            downloadCount: true,
          },
        });
        const totalInstalls = skills.reduce(
          (sum: number, sk) => sum + sk.downloadCount,
          0,
        );
        res.json({
          success: true,
          data: { skills, totalInstalls, skillCount: skills.length },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}\n```\n