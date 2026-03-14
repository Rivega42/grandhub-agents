/**
 * agents/architect.ts — Architect агент: spec.md → Epic[] → Task[] → батчинг в queue.json
 *
 * Читает markdown-спецификацию проекта, декомпозирует через LLM на Epic'и,
 * каждый Epic разбивает на конкретные задачи, затем батчами добавляет в queue.json.
 *
 * Использование:
 *   ts-node agents/architect.ts --spec /path/to/project-spec.md [--batch-size 10] [--service telegram-bot]
 */

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import type { TaskSpec } from '../types/task-spec';

// ─── Типы ─────────────────────────────────────────────────────────────────────

interface Epic {
  id: string;
  title: string;
  description: string;
  service: string;
  priority: number;
}

interface ArchTask {
  id: string;
  title: string;
  description: string;
  service: string;
  file_scope: string[];
  allow_test_failure: boolean;
}

interface QueueEntry {
  task_id: string;
  spec_file: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  added_at: string;
  started_at?: string;
  finished_at?: string;
  result?: string;
  score?: number;
}

interface ProjectSummary {
  spec_file: string;
  started_at: string;
  finished_at: string;
  total_epics: number;
  total_tasks: number;
  batches: number;
  batch_size: number;
  results: {
    done: number;
    failed: number;
    pending: number;
  };
  epics: Array<{
    id: string;
    title: string;
    tasks_count: number;
  }>;
}

// ─── Конфигурация ─────────────────────────────────────────────────────────────

const GHA_ROOT = path.dirname(__dirname) || '/opt/grandhub-agents';
const QUEUE_FILE = path.join(GHA_ROOT, 'queue.json');
const STATE_DIR = path.join(GHA_ROOT, '.agent-state');

const CONFIG = {
  model: 'anthropic/claude-opus-4-6',
  openrouterKey: process.env.OPENROUTER_API_KEY ?? '',
  pollIntervalMs: 30_000,
} as const;

// ─── LLM HTTP клиент (паттерн из coder.ts) ───────────────────────────────────

async function callLLM(systemPrompt: string, userMessage: string): Promise<string> {
  const maxRetries = 3;
  const delays = [0, 5000, 15000];
  let lastError: Error = new Error('LLM: no attempts made');

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      const delayMs = delays[attempt] ?? 15000;
      console.error(`[architect] LLM retry ${attempt + 1}/${maxRetries} (ждём ${delayMs / 1000}s)...`);
      await new Promise(r => setTimeout(r, delayMs));
    }
    try {
      return await callLLMOnce(systemPrompt, userMessage);
    } catch (e) {
      lastError = e as Error;
      console.error(`[architect] LLM attempt ${attempt + 1}/${maxRetries} failed: ${lastError.message}`);
    }
  }
  throw lastError;
}

async function callLLMOnce(systemPrompt: string, userMessage: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: CONFIG.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 16000,
      temperature: 0.2,
    });

    const baseUrl = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai';
    const isLocal = baseUrl.startsWith('http://');
    const parsedUrl = new URL(baseUrl);
    const requester = isLocal ? http : https;
    const apiPath = isLocal ? '/v1/chat/completions' : '/api/v1/chat/completions';

    const req = requester.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port ? parseInt(parsedUrl.port) : (isLocal ? 80 : 443),
        path: apiPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CONFIG.openrouterKey}`,
          'X-Title': 'GrandHub Architect Agent',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data) as {
              error?: { message?: string };
              choices?: Array<{ message?: { content?: string } }>;
            };
            if (json.error) {
              reject(new Error(json.error.message ?? JSON.stringify(json.error)));
              return;
            }
            const content = json.choices?.[0]?.message?.content;
            if (!content) {
              reject(new Error('LLM вернул пустой ответ'));
              return;
            }
            resolve(content);
          } catch {
            reject(new Error(`Невалидный ответ LLM: ${data.slice(0, 200)}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Парсинг JSON из LLM ─────────────────────────────────────────────────────

function parseJSONFromLLM<T>(raw: string): T {
  // Стратегия 1: ```json блок
  const jsonBlock = raw.match(/```json\s*([\s\S]*?)\s*```/s);
  if (jsonBlock) {
    try {
      return JSON.parse(jsonBlock[1]) as T;
    } catch { /* fallthrough */ }
  }

  // Стратегия 2: первый [ ... ] (для массивов)
  const firstBracket = raw.indexOf('[');
  const lastBracket = raw.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try {
      return JSON.parse(raw.slice(firstBracket, lastBracket + 1)) as T;
    } catch { /* fallthrough */ }
  }

  // Стратегия 3: первый { ... }
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1)) as T;
    } catch { /* fallthrough */ }
  }

  // Стратегия 4: весь ответ
  return JSON.parse(raw) as T;
}

// ─── Фаза 1: Декомпозиция на Epic'и ──────────────────────────────────────────

async function decomposeToEpics(specContent: string, defaultService: string): Promise<Epic[]> {
  const systemPrompt = `Ты архитектор. Прочитай спецификацию проекта и выдели от 5 до 20 крупных фич (Epic).
Каждый Epic — это самостоятельная фича которую можно реализовать и протестировать отдельно.
Отвечай ТОЛЬКО JSON массивом:
[{"id":"epic-1","title":"...","description":"...","service":"${defaultService}","priority":1}]

Правила:
- id: epic-1, epic-2, ...
- priority: 1 = самый важный (инфраструктура/базовые вещи), 20 = наименее важный
- service: название сервиса (если в спеке указано несколько — используй конкретный для каждого Epic)
- Сортируй по priority (сначала базовые вещи, потом фичи)`;

  const raw = await callLLM(systemPrompt, specContent);
  const epics = parseJSONFromLLM<Epic[]>(raw);

  if (!Array.isArray(epics) || epics.length === 0) {
    throw new Error('LLM не вернул список Epic\'ов');
  }

  return epics.sort((a, b) => a.priority - b.priority);
}

// ─── Фаза 2: Декомпозиция Epic на задачи ─────────────────────────────────────

async function decomposeEpicToTasks(epic: Epic, specContent: string): Promise<ArchTask[]> {
  const systemPrompt = `Декомпозируй Epic на 3-10 конкретных задач для разработчика.
Каждая задача = изменение 1-3 файлов. Задачи должны быть атомарными и тестируемыми.

ТОЛЬКО JSON массив:
[{"id":"${epic.id}-task-1","title":"...","description":"...","service":"${epic.service}","file_scope":["src/path.ts"],"allow_test_failure":false}]

Правила:
- id: ${epic.id}-task-1, ${epic.id}-task-2, ...
- file_scope: конкретные файлы (относительно корня сервиса)
- allow_test_failure: true только для UI/визуальных задач без юнит-тестов
- description: достаточно подробное чтобы разработчик мог реализовать без дополнительных вопросов`;

  const userMsg = `Epic: ${epic.title}
Описание: ${epic.description}
Сервис: ${epic.service}

Контекст проекта:
${specContent.slice(0, 8000)}`;

  const raw = await callLLM(systemPrompt, userMsg);
  const tasks = parseJSONFromLLM<ArchTask[]>(raw);

  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error(`LLM не вернул задачи для Epic ${epic.id}`);
  }

  return tasks;
}

// ─── Создание TaskSpec файла ──────────────────────────────────────────────────

function createTaskSpec(task: ArchTask, epicTitle: string, stateDir: string): string {
  const spec: TaskSpec = {
    task_id: task.id,
    title: task.title,
    description: `[Epic: ${epicTitle}]\n\n${task.description}`,
    priority: 'medium',
    type: 'feature',
    acceptance_criteria: [
      `Код компилируется без ошибок (tsc --noEmit)`,
      `Lint проходит без критических ошибок`,
      task.allow_test_failure ? 'Тесты могут падать (allow_test_failure)' : 'Все тесты проходят',
    ],
    file_scope: task.file_scope,
    dependencies: [],
    blocked_by: [],
    service: task.service,
    estimated_complexity: task.file_scope.length <= 1 ? 'simple' : 'medium',
    timeout_minutes: 15,
    max_retries: 2,
    escalation_threshold: 2,
    allow_test_failure: task.allow_test_failure,
    cost_budget_usd: 1.0,
    created_at: new Date().toISOString(),
    created_by: 'orchestrator',
    status: 'pending',
    assigned_to: null,
    worktree_branch: `agent/${task.id}`,
    checkpoint_file: path.join(STATE_DIR, `${task.id}.json`),
  };

  const specFile = path.join(stateDir, `${task.id}.json`);
  fs.writeFileSync(specFile, JSON.stringify(spec, null, 2));
  return specFile;
}

// ─── Queue management ─────────────────────────────────────────────────────────

function readQueue(): QueueEntry[] {
  if (!fs.existsSync(QUEUE_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')) as QueueEntry[];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueueEntry[]): void {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

function addBatchToQueue(specFiles: Array<{ taskId: string; specFile: string }>): void {
  const queue = readQueue();
  for (const { taskId, specFile } of specFiles) {
    // Не добавляем дубликаты
    if (queue.some(q => q.task_id === taskId)) continue;
    queue.push({
      task_id: taskId,
      spec_file: specFile,
      status: 'pending',
      added_at: new Date().toISOString(),
    });
  }
  writeQueue(queue);
}

async function waitForBatchCompletion(taskIds: string[]): Promise<{ done: number; failed: number }> {
  const results = { done: 0, failed: 0 };

  while (true) {
    await new Promise(r => setTimeout(r, CONFIG.pollIntervalMs));

    const queue = readQueue();
    let allDone = true;

    results.done = 0;
    results.failed = 0;

    for (const taskId of taskIds) {
      const entry = queue.find(q => q.task_id === taskId);
      if (!entry) continue;

      if (entry.status === 'done') {
        results.done++;
      } else if (entry.status === 'failed') {
        results.failed++;
      } else {
        allDone = false;
      }
    }

    const completed = results.done + results.failed;
    const total = taskIds.length;
    if (completed > 0 && completed % 3 === 0) {
      console.error(`[architect]   ... прогресс: ${completed}/${total} (${results.done} done, ${results.failed} failed)`);
    }

    if (allDone || completed === total) break;
  }

  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    console.log('Usage: ts-node agents/architect.ts --spec <path.md> [--batch-size 10] [--service telegram-bot]');
    process.exit(0);
  }

  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const specFile = get('--spec');
  const batchSize = parseInt(get('--batch-size') ?? '10', 10);
  const defaultService = get('--service') ?? 'telegram-bot';

  if (!specFile) {
    console.error('[architect] Ошибка: --spec обязателен');
    process.exit(1);
  }

  if (!fs.existsSync(specFile)) {
    console.error(`[architect] Файл не найден: ${specFile}`);
    process.exit(1);
  }

  if (!CONFIG.openrouterKey) {
    console.error('[architect] Ошибка: OPENROUTER_API_KEY не установлен');
    process.exit(1);
  }

  const startedAt = new Date().toISOString();
  const timestamp = Date.now();
  const stateDir = path.join(STATE_DIR, `arch-${timestamp}`);
  fs.mkdirSync(stateDir, { recursive: true });

  console.error(`[architect] 📋 Spec: ${specFile}`);
  console.error(`[architect] 📦 Batch size: ${batchSize}`);
  console.error(`[architect] 🔧 Default service: ${defaultService}`);
  console.error('');

  const specContent = fs.readFileSync(specFile, 'utf8');

  // ─── Фаза 1: Epic decomposition ──────────────────────────────────────────

  console.error('[architect] 🏗️  Фаза 1: Декомпозиция на Epic\'и...');
  const epics = await decomposeToEpics(specContent, defaultService);
  console.error(`[architect] ✅ Найдено ${epics.length} Epic'ов\n`);

  // ─── Фаза 2: Task decomposition ──────────────────────────────────────────

  const allTasks: Array<{ taskId: string; specFile: string; epicId: string }> = [];

  for (let i = 0; i < epics.length; i++) {
    const epic = epics[i];
    console.error(`[architect] Epic ${i + 1}/${epics.length}: "${epic.title}" (${epic.service})`);

    let tasks: ArchTask[];
    try {
      tasks = await decomposeEpicToTasks(epic, specContent);
    } catch (e) {
      console.error(`[architect] ⚠️  Ошибка декомпозиции Epic ${epic.id}: ${(e as Error).message}`);
      continue;
    }

    console.error(`[architect]   → ${tasks.length} задач`);

    for (const task of tasks) {
      const specFilePath = createTaskSpec(task, epic.title, stateDir);
      allTasks.push({ taskId: task.id, specFile: specFilePath, epicId: epic.id });
    }
  }

  console.error(`\n[architect] 📊 Итого: ${allTasks.length} задач из ${epics.length} Epic'ов`);

  if (allTasks.length === 0) {
    console.error('[architect] ❌ Нет задач для выполнения');
    process.exit(1);
  }

  // ─── Фаза 3: Батчинг в queue.json ────────────────────────────────────────

  const batches: Array<Array<{ taskId: string; specFile: string }>> = [];
  for (let i = 0; i < allTasks.length; i += batchSize) {
    batches.push(allTasks.slice(i, i + batchSize));
  }

  console.error(`[architect] 🚀 Будет ${batches.length} батчей по ${batchSize} задач\n`);

  let totalDone = 0;
  let totalFailed = 0;

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    const taskIds = batch.map(b => b.taskId);

    console.error(`[architect] Батч ${batchIdx + 1}/${batches.length} добавлен (${batch.length} задач)`);
    addBatchToQueue(batch);

    console.error(`[architect] Ждём завершения батча ${batchIdx + 1}...`);
    const results = await waitForBatchCompletion(taskIds);

    totalDone += results.done;
    totalFailed += results.failed;

    console.error(
      `[architect] Батч ${batchIdx + 1} завершён: ${results.done} done, ${results.failed} failed\n`
    );
  }

  // ─── Итог: сохраняем summary ─────────────────────────────────────────────

  const summary: ProjectSummary = {
    spec_file: specFile,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    total_epics: epics.length,
    total_tasks: allTasks.length,
    batches: batches.length,
    batch_size: batchSize,
    results: {
      done: totalDone,
      failed: totalFailed,
      pending: allTasks.length - totalDone - totalFailed,
    },
    epics: epics.map(e => ({
      id: e.id,
      title: e.title,
      tasks_count: allTasks.filter(t => t.epicId === e.id).length,
    })),
  };

  const summaryFile = path.join(GHA_ROOT, `project-${timestamp}-summary.json`);
  fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));

  console.error('[architect] ════════════════════════════════════════');
  console.error(`[architect] ✅ Проект завершён!`);
  console.error(`[architect]    Epic'ов: ${summary.total_epics}`);
  console.error(`[architect]    Задач: ${summary.total_tasks}`);
  console.error(`[architect]    Done: ${totalDone} | Failed: ${totalFailed}`);
  console.error(`[architect]    Summary: ${summaryFile}`);
  console.error('[architect] ════════════════════════════════════════');
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (require.main === module) {
  main().catch(err => {
    console.error('[architect] FATAL:', err.message);
    process.exit(1);
  });
}

export { main as runArchitect, decomposeToEpics, decomposeEpicToTasks };
export type { Epic, ArchTask, ProjectSummary };
