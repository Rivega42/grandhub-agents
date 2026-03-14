/**
 * agents/orchestrator.ts — Orchestrator агент
 *
 * Читает очередь задач из queue.json, запускает Coder последовательно,
 * уведомляет в Telegram о статусе каждой задачи.
 *
 * Использование:
 *   ts-node agents/orchestrator.ts             # разовый прогон
 *   ts-node agents/orchestrator.ts --watch     # следит за queue.json, запускает по мере появления
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn, spawnSync } from 'child_process';
import PQueue from 'p-queue';
import * as https from 'https';
import * as http from 'http';

// ─── Конфиг ──────────────────────────────────────────────────────────────────

const CONFIG = {
  stateDir:    path.resolve(__dirname, '../.agent-state'),
  logsDir:     path.resolve(__dirname, '../.agent-logs'),
  queueFile:   path.resolve(__dirname, '../queue.json'),
  scriptDir:   path.resolve(__dirname, '../'),
  tgBotToken:  process.env.TELEGRAM_BOT_TOKEN ?? '',
  tgChatId:    process.env.TELEGRAM_CHAT_ID   ?? '357896330',
  watchIntervalMs: 30_000,
  healthPort: Number(process.env.GHA_HEALTH_PORT ?? '9090'),
  repoRoot: process.env.GRANDHUB_ROOT ?? '/opt/grandhub-v3',
} as const;

// ─── Типы ─────────────────────────────────────────────────────────────────────

interface QueueEntry {
  task_id: string;
  spec_file: string;          // путь к TaskSpec JSON
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  added_at: string;
  started_at?: string;
  finished_at?: string;
  result?: 'success' | 'escalated' | 'reviewer_rejected';
  score?: number;
  review_attempts?: number;   // сколько раз Reviewer отклонял
  review_feedback?: string;   // последний фидбек от Reviewer (для retry)
}

// ─── Telegram уведомления ─────────────────────────────────────────────────────

function tgSend(text: string): void {
  if (!CONFIG.tgBotToken) { return; }
  // spawnSync curl — блокирующий, процесс не умрёт до отправки
  const body = JSON.stringify({ chat_id: CONFIG.tgChatId, text, parse_mode: 'HTML' });
  const r = spawnSync('curl', [
    '-s', '-X', 'POST',
    `https://api.telegram.org/bot${CONFIG.tgBotToken}/sendMessage`,
    '-H', 'Content-Type: application/json',
    '-d', body,
  ], { encoding: 'utf8', timeout: 10000 });
  try {
    const resp = JSON.parse(r.stdout ?? '{}');
    if (resp.ok) console.error(`[orchestrator] Telegram OK msg=${resp.result?.message_id}`);
    else console.error('[orchestrator] Telegram ERR:', resp.description);
  } catch { console.error('[orchestrator] Telegram raw:', (r.stdout ?? '').slice(0, 80)); }
}
// ─── Глобальная очередь задач ──────────────────────────────────────────────────
const taskQueue = new PQueue({ concurrency: 1 });
let isShuttingDown = false;

// ─── Метрики в памяти ─────────────────────────────────────────────────────────
const METRICS_FILE = path.join(
  path.resolve(__dirname, '../.agent-state'),
  'metrics.json'
);

function loadPersistedMetrics() {
  if (fs.existsSync(METRICS_FILE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(METRICS_FILE, 'utf8'));
      return { ...saved, startedAt: new Date().toISOString(), currentTask: null };
    } catch { /* ok */ }
  }
  return {
    startedAt: new Date().toISOString(),
    tasksCompleted: 0, tasksFailed: 0, tasksEscalated: 0,
    totalDurationMs: 0, lastTaskId: '', lastTaskAt: '', currentTask: null as string | null,
  };
}

function persistMetrics(): void {
  try { fs.writeFileSync(METRICS_FILE, JSON.stringify(metrics, null, 2)); }
  catch { /* ok */ }
}

const metrics = loadPersistedMetrics();

// ─── Health HTTP Server ────────────────────────────────────────────────────────
function startHealthServer(): void {
  const server = http.createServer((req, res) => {
    if (req.url === '/healthz' || req.url === '/health') {
      const queue = (() => {
        try { return JSON.parse(require('fs').readFileSync(CONFIG.queueFile, 'utf8')); }
        catch { return []; }
      })();
      const pending   = queue.filter((e: { status: string }) => e.status === 'pending').length;
      const running   = queue.filter((e: { status: string }) => e.status === 'running').length;
      const done      = queue.filter((e: { status: string }) => e.status === 'done').length;
      const failed    = queue.filter((e: { status: string }) => e.status === 'failed').length;
      const avgMs = metrics.tasksCompleted > 0
        ? Math.round(metrics.totalDurationMs / metrics.tasksCompleted)
        : null;

      const body = JSON.stringify({
        status: isShuttingDown ? 'shutting_down' : 'ok',
        uptime: Math.round((Date.now() - new Date(metrics.startedAt).getTime()) / 1000),
        startedAt: metrics.startedAt,
        queue: { pending, running, done, failed },
        tasks: {
          completed: metrics.tasksCompleted,
          failed: metrics.tasksFailed,
          escalated: metrics.tasksEscalated,
          avgDurationMs: avgMs,
        },
        current: metrics.currentTask,
        lastTask: { id: metrics.lastTaskId, at: metrics.lastTaskAt },
        watchdog: {
          queueConcurrency: taskQueue.concurrency,
          queueSize: taskQueue.size,
          queuePending: taskQueue.pending,
        },
      }, null, 2);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body);
    } else if (req.url === '/metrics') {
      // Prometheus text format
      const lines = [
        `# HELP gha_tasks_completed Total completed tasks`,
        `# TYPE gha_tasks_completed counter`,
        `gha_tasks_completed ${metrics.tasksCompleted}`,
        `# HELP gha_tasks_failed Total failed tasks`,
        `# TYPE gha_tasks_failed counter`,
        `gha_tasks_failed ${metrics.tasksFailed}`,
        `# HELP gha_task_avg_duration_ms Average task duration in ms`,
        `# TYPE gha_task_avg_duration_ms gauge`,
        `gha_task_avg_duration_ms ${metrics.tasksCompleted > 0 ? Math.round(metrics.totalDurationMs / metrics.tasksCompleted) : 0}`,
        `# HELP gha_queue_pending Pending tasks in queue`,
        `# TYPE gha_queue_pending gauge`,
        `gha_queue_pending ${taskQueue.size}`,
      ].join('\n');
      res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
      res.end(lines + '\n');
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(CONFIG.healthPort, '127.0.0.1', () => {
    console.error(`[orchestrator] 🩺 Health: http://127.0.0.1:${CONFIG.healthPort}/healthz`);
  });

  server.on('error', (err) => {
    console.error('[orchestrator] Health server error:', err.message);
  });
}

// ─── Нотификация через файл (OpenClaw heartbeat подхватит) ────────────────────
const COMPLETED_FILE = path.join(CONFIG.stateDir, 'completed-tasks.json');

function notifyCompletion(entry: QueueEntry, status: 'done' | 'failed' | 'review', details: {
  score?: number; verdict?: string; error?: string; pr_url?: string;
}): void {
  // Записываем результат в файл — OpenClaw heartbeat прочитает и сообщит Роману
  let pending: any[] = [];
  if (fs.existsSync(COMPLETED_FILE)) {
    try { pending = JSON.parse(fs.readFileSync(COMPLETED_FILE, 'utf8')); } catch { pending = []; }
  }
  pending.push({
    task_id: entry.task_id,
    title: (entry as any).title ?? entry.task_id,
    status,
    timestamp: new Date().toISOString(),
    notified: false,
    ...details,
  });
  fs.writeFileSync(COMPLETED_FILE, JSON.stringify(pending, null, 2));
  console.error(`[orchestrator] 📝 Completion written → ${COMPLETED_FILE}`);
}




// ─── Комментарий в GitHub Issue ──────────────────────────────────────────────
function ghComment(issueNumber: number | undefined, body: string): void {
  if (!issueNumber || !process.env.GITHUB_TOKEN) return;
  const r = spawnSync('gh', ['issue', 'comment', String(issueNumber),
    '--repo', 'Rivega42/grandhub-feedback',
    '--body', body,
  ], {
    encoding: 'utf8',
    env: { ...process.env, GH_TOKEN: process.env.GITHUB_TOKEN },
    timeout: 15000,
  });
  if (r.status === 0) {
    console.error(`[orchestrator] 💬 Comment posted → issue #${issueNumber}`);
  } else {
    console.error(`[orchestrator] ⚠️  gh comment failed: ${(r.stderr ?? '').slice(0, 100)}`);
  }
}

// ─── Очередь ──────────────────────────────────────────────────────────────────

function loadQueue(): QueueEntry[] {
  if (!fs.existsSync(CONFIG.queueFile)) return [];
  try { return JSON.parse(fs.readFileSync(CONFIG.queueFile, 'utf8')); }
  catch { return []; }
}

function saveQueue(queue: QueueEntry[]): void {
  fs.writeFileSync(CONFIG.queueFile, JSON.stringify(queue, null, 2));
}

function pendingTasks(queue: QueueEntry[]): QueueEntry[] {
  return queue.filter(e => e.status === 'pending');
}

// ─── Запуск задачи ────────────────────────────────────────────────────────────

async function runTask(entry: QueueEntry, queue: QueueEntry[]): Promise<void> {
  const idx = queue.findIndex(e => e.task_id === entry.task_id);
  if (idx === -1) return;

  queue[idx].status = 'running';
  queue[idx].started_at = new Date().toISOString();
  saveQueue(queue);

  // Читаем TaskSpec для красивого уведомления
  let title = entry.task_id;
  try { title = JSON.parse(fs.readFileSync(entry.spec_file, 'utf8')).title ?? title; } catch { /* ok */ }

  console.error(`\n[orchestrator] 🚀 Запуск: ${entry.task_id} — ${title}`);
  metrics.currentTask = entry.task_id;

  const coderScript = path.join(CONFIG.scriptDir, 'run-coder.sh');

  // Concurrency safety: один активный task на сервис
  let serviceId = 'unknown';
  try {
    serviceId = JSON.parse(fs.readFileSync(entry.spec_file, 'utf8')).service ?? 'unknown';
    const currentQ = loadQueue();
    const conflicting = currentQ.find(e =>
      e.task_id !== entry.task_id &&
      e.status === 'running' &&
      (() => {
        try { return JSON.parse(fs.readFileSync(e.spec_file, 'utf8')).service === serviceId; }
        catch { return false; }
      })()
    );
    if (conflicting) {
      console.error(`[orchestrator] ⏳ ${entry.task_id} — ждёт: ${serviceId} занят (${conflicting.task_id})`);
      const qi = currentQ.findIndex(e => e.task_id === entry.task_id);
      if (qi !== -1) { currentQ[qi].status = 'pending'; saveQueue(currentQ); }
      return;
    }
  } catch { /* ok */ }

  // Async spawn — не блокирует event loop
  // Если есть фидбек от Reviewer — передаём в coder
  const reviewFeedbackFile = path.join(CONFIG.stateDir, `${entry.task_id}-reviewer-feedback.json`);
  const hasReviewFeedback = fs.existsSync(reviewFeedbackFile);

  const { exitCode, stderr: stderrOut } = await new Promise<{ exitCode: number; stderr: string }>((resolve) => {
    const stderrChunks: Buffer[] = [];
    const coderArgs = ['--task-file', entry.spec_file];
    if (hasReviewFeedback) coderArgs.push('--review-feedback', reviewFeedbackFile);
    const child = spawn('bash', [coderScript, ...coderArgs], {
      stdio: ['ignore', 'inherit', 'pipe'], // stdout → terminal, stderr → capture
      timeout: 30 * 60 * 1000,
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
      process.stderr.write(chunk); // тоже в systemd journal
    });

    child.on('exit', (code) => resolve({ exitCode: code ?? 1, stderr: Buffer.concat(stderrChunks).toString('utf8') }));
    child.on('error', (err) => resolve({ exitCode: 1, stderr: err.message }));
  });

  // Логируем stderr в файл
  fs.mkdirSync(CONFIG.logsDir, { recursive: true });
  fs.appendFileSync(
    path.join(CONFIG.logsDir, `${entry.task_id}.log`),
    `\n=== Orchestrator run ${new Date().toISOString()} ===\n${stderrOut}`
  );

  // Переопределяем result для совместимости
  const result = { status: exitCode };

  queue[idx].finished_at = new Date().toISOString();

  if (result.status === 0) {
    // Читаем результат reviewer из state
    const reviewFile = path.join(CONFIG.stateDir, `${entry.task_id}-review.json`);
    let reviewVerdict = 'unknown';
    let reviewScore = 0;
    if (fs.existsSync(reviewFile)) {
      try {
        const review = JSON.parse(fs.readFileSync(reviewFile, 'utf8'));
        reviewVerdict = review.verdict;
        reviewScore = review.score;
      } catch { /* ok */ }
    }

    if (reviewVerdict === 'approve') {
      queue[idx].status = 'done';
      queue[idx].result = 'success';
      queue[idx].score = reviewScore;
      console.error(`[orchestrator] ✅ ${entry.task_id} — DONE (score: ${reviewScore})`);
      metrics.tasksCompleted++;
      metrics.totalDurationMs += queue[idx].finished_at && queue[idx].started_at
        ? new Date(queue[idx].finished_at!).getTime() - new Date(queue[idx].started_at!).getTime()
        : 0;
      metrics.lastTaskId = entry.task_id;
      metrics.lastTaskAt = new Date().toISOString();
      metrics.currentTask = null;
      persistMetrics();
      // Достаём PR url из checkpoint
      let prUrl: string | undefined;
      try {
        const cpFile = path.join(CONFIG.stateDir, `${entry.task_id}.json`);
        const cp = JSON.parse(fs.readFileSync(cpFile, 'utf8'));
        const prEntry = (cp.git_commits ?? []).find((s: string) => s.startsWith('PR: '));
        if (prEntry) prUrl = (prEntry as string).replace('PR: ', '').trim();
      } catch { /* ignore */ }
      notifyCompletion(entry, 'done', { score: reviewScore, verdict: 'approved', pr_url: prUrl });
      cleanupWorktree(entry.task_id);
      // Cleanup worktree после успешного merge
      cleanupWorktree(entry.task_id);
      // Комментарий в issue
      const doneBody = [
        `✅ **Задача выполнена агентом GHA**`,
        ``,
        `**Score:** ${reviewScore}/100 (Reviewer одобрил)`,
        prUrl ? `**PR:** ${prUrl}` : '',
        `**Задача:** ${entry.task_id}`,
      ].filter(Boolean).join('\n');
      ghComment((entry as any).github_issue, doneBody);
    } else {
      // Reviewer REJECT — даём 2 попытки переделать
      const MAX_REVIEW_RETRIES = 2;
      const prevAttempts = (entry as any).review_attempts ?? 0;

      if (prevAttempts < MAX_REVIEW_RETRIES) {
        // Извлекаем фидбек из review файла
        let feedback = `Reviewer вернул: ${reviewVerdict} (score: ${reviewScore}/100)`;
        try {
          const reviewFile = path.join(CONFIG.stateDir, `${entry.task_id}-review.json`);
          const rv = JSON.parse(fs.readFileSync(reviewFile, 'utf8'));
          const issues = (rv.issues ?? [])
            .filter((i: { severity: string }) => ['critical', 'major'].includes(i.severity))
            .map((i: { severity: string; file: string; message: string; suggestion?: string }) =>
              `[${i.severity}] ${i.file}: ${i.message}${i.suggestion ? ` → ${i.suggestion}` : ''}`
            )
            .join('\n');
          if (issues) feedback += `\n\nПроблемы:\n${issues}`;
        } catch { /* ok */ }

        // Пишем feedback файл чтобы coder знал о нём
        fs.writeFileSync(
          path.join(CONFIG.stateDir, `${entry.task_id}-reviewer-feedback.json`),
          JSON.stringify({ feedback, attempt: prevAttempts + 1, ts: new Date().toISOString() }, null, 2)
        );

        // Сбрасываем задачу обратно в pending — coder перезапустится с фидбеком
        queue[idx].status = 'pending';
        queue[idx].result = undefined;
        (queue[idx] as any).review_attempts = prevAttempts + 1;
        (queue[idx] as any).review_feedback = feedback;
        queue[idx].started_at = undefined;
        queue[idx].finished_at = undefined;

        // Чистим checkpoint чтобы coder начал заново
        const cpFile = path.join(CONFIG.stateDir, `${entry.task_id}.json`);
        if (fs.existsSync(cpFile)) fs.unlinkSync(cpFile);

        console.error(`[orchestrator] 🔁 ${entry.task_id} — REJECT retry ${prevAttempts + 1}/${MAX_REVIEW_RETRIES} (score: ${reviewScore})`);
        saveQueue(queue);
        return; // выходим — задача вернётся в tick
      }

      // Исчерпали попытки
      queue[idx].status = 'done';
      queue[idx].result = 'reviewer_rejected';
      queue[idx].score = reviewScore;
      console.error(`[orchestrator] ⚠️ ${entry.task_id} — REJECT (исчерпаны попытки, score: ${reviewScore})`);
      notifyCompletion(entry, 'review', { score: reviewScore, verdict: reviewVerdict });
      ghComment((entry as any).github_issue, `⚠️ **Reviewer отклонил после ${prevAttempts + 1} попыток** (score: ${reviewScore}/100)\n\n**Задача:** ${entry.task_id}\n\nНужно ручное вмешательство.`);
    }
  } else {
    // Проверяем escalation
    const escalFile = path.join(CONFIG.stateDir, `${entry.task_id}-escalation.json`);
    const isEscalated = fs.existsSync(escalFile);

    queue[idx].status = 'failed';
    queue[idx].result = isEscalated ? 'escalated' : 'escalated';
    console.error(`[orchestrator] ❌ ${entry.task_id} — FAILED${isEscalated ? ' (escalated)' : ''}`);
    metrics.tasksFailed++;
    if (isEscalated) metrics.tasksEscalated++;
    metrics.lastTaskId = entry.task_id;
    metrics.lastTaskAt = new Date().toISOString();
    metrics.currentTask = null;
    persistMetrics();

    let lastError = '';
    if (isEscalated) {
      try { lastError = JSON.parse(fs.readFileSync(escalFile, 'utf8')).last_error ?? ''; } catch { /* ok */ }
    }

    notifyCompletion(entry, 'failed', { error: lastError?.slice(0, 300) });
    // Cleanup мусорного worktree
    cleanupWorktree(entry.task_id);
    // Комментарий в issue
    const failBody = [
      `❌ **Агент GHA не смог выполнить задачу**`,
      ``,
      lastError ? `**Ошибка:** ${lastError.slice(0, 300)}` : '',
      `**Задача:** ${entry.task_id}`,
      `Нужно ручное вмешательство.`,
    ].filter(Boolean).join('\n');
    ghComment((entry as any).github_issue, failBody);
  }

  saveQueue(queue);
}

// ─── Основной цикл ────────────────────────────────────────────────────────────

async function runOnce(): Promise<void> {
  const queue = loadQueue();
  const pending = pendingTasks(queue);

  if (pending.length === 0) {
    console.error('[orchestrator] Очередь пуста.');
    return;
  }

  console.error(`[orchestrator] В очереди: ${pending.length} задач`);

  for (const entry of pending) {
    await runTask(entry, queue);
  }

  console.error('[orchestrator] Все задачи обработаны.');
}

// ─── Worktree Cleanup ─────────────────────────────────────────────────────────
function cleanupWorktree(taskId: string): void {
  const worktreeBase = path.join(CONFIG.repoRoot ?? '/opt/grandhub-v3', 'worktrees', taskId);
  try {
    // git worktree remove --force
    const r = spawnSync('git', ['worktree', 'remove', '--force', worktreeBase], {
      cwd: CONFIG.repoRoot ?? '/opt/grandhub-v3',
      encoding: 'utf8',
    });
    if (r.status === 0) {
      console.error(`[orchestrator] 🧹 Worktree удалён: ${worktreeBase}`);
    }
    // Удаляем ветку агента
    spawnSync('git', ['branch', '-D', `agent/${taskId}`], {
      cwd: CONFIG.repoRoot ?? '/opt/grandhub-v3',
      encoding: 'utf8',
    });
  } catch (e) {
    console.error(`[orchestrator] ⚠️  Cleanup failed for ${taskId}: ${(e as Error).message}`);
  }
}

// ─── Watchdog ─────────────────────────────────────────────────────────────────
function startWatchdog(): void {
  const combinedLog = '/opt/grandhub-agents/.agent-logs/combined.jsonl';
  let lastAlertSent = 0;

  setInterval(() => {
    if (!fs.existsSync(combinedLog)) return;
    const stat = fs.statSync(combinedLog);
    const silentMinutes = (Date.now() - stat.mtimeMs) / 60_000;

    if (silentMinutes > 30) {
      const alert = {
        alert: 'GHA: нет активности 30+ минут',
        silentMinutes: Math.round(silentMinutes),
        ts: new Date().toISOString(),
      };
      fs.writeFileSync(
        '/opt/grandhub-agents/.agent-state/watchdog-alert.json',
        JSON.stringify(alert, null, 2)
      );
      console.error(`[watchdog] ⚠️  Нет активности ${Math.round(silentMinutes)} минут`);

      // Telegram alert — не чаще раза в час
      const now = Date.now();
      if (now - lastAlertSent > 60 * 60_000) {
        lastAlertSent = now;
        tgSend(`⚠️ <b>GHA Watchdog Alert</b>\nНет активности уже <b>${Math.round(silentMinutes)} минут</b>\n\nПроверь: <code>systemctl status grandhub-gha-watch</code>`);
      }
    }
  }, 5 * 60_000);
}


async function watchMode(): Promise<void> {
  console.error(`[orchestrator] 👀 Watch режим — проверяю каждые ${CONFIG.watchIntervalMs / 1000}с`);
  console.error('[orchestrator] 🤖 GHA Orchestrator запущен (watch режим)');
  startHealthServer();
  startWatchdog();

  // Crash recovery: незавершённые задачи из предыдущего запуска
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { loadIncompleteStates } = require('./task-state') as typeof import('./task-state');
    const incomplete = loadIncompleteStates();
    if (incomplete.length > 0) {
      console.error(`[orchestrator] 🔄 Crash recovery: ${incomplete.length} незавершённых задач`);
      const queue = loadQueue();
      for (const state of incomplete) {
        const inQueue = queue.find(e => e.task_id === state.taskId);
        const specFile = path.join(CONFIG.stateDir, `${state.taskId}-spec.json`);
        if (!inQueue && fs.existsSync(specFile)) {
          console.error(`[orchestrator] 🔄 Возвращаю: ${state.taskId} (фаза: ${state.phase})`);
          queue.push({
            task_id: state.taskId,
            spec_file: specFile,
            status: 'pending',
            added_at: state.startedAt,
          });
        }
      }
      saveQueue(queue);
    }
  } catch (e) {
    console.error('[orchestrator] ⚠️  Crash recovery failed:', (e as Error).message);
  }

  const tick = (): void => {
    if (isShuttingDown) return;
    // Сначала синхронно подтягиваем новые issues → задачи
    try {
      const issuesScript = path.join(CONFIG.scriptDir, 'agents/issues-to-tasks.ts');
      spawnSync(
        'node_modules/.bin/ts-node',
        [issuesScript],
        { cwd: path.join(CONFIG.scriptDir), stdio: 'inherit', timeout: 60_000 }
      );
    } catch { /* ignore */ }
    const queue = loadQueue();
    const pending = pendingTasks(queue);
    // Rate limit: не более 10 задач одновременно в очереди
    const MAX_PENDING = 10;
    const running = queue.filter(e => e.status === 'running').length;
    const pendingSlice = pending.slice(0, Math.max(0, MAX_PENDING - running));
    if (pendingSlice.length > 0 && pending.length > pendingSlice.length) {
      console.error(`[orchestrator] ⏳ Rate limit: обрабатываю ${pendingSlice.length}/${pending.length}`);
    }
    if (pendingSlice.length > 0) {
      console.error(`[orchestrator] Новых задач: ${pendingSlice.length}`);
      for (const entry of pendingSlice) {
        // p-queue: не добавляем если уже в очереди или running
        const fresh = loadQueue();
        const current = fresh.find(e => e.task_id === entry.task_id);
        if (current?.status === 'running') continue;
        const capturedEntry = { ...entry };
        taskQueue.add(async () => {
          const q = loadQueue();
          await runTask(capturedEntry, q);
        }).catch(err =>
          console.error(`[orchestrator] Task error ${capturedEntry.task_id}: ${err.message}`)
        );
      }
    }
  };

  // Обрабатываем SIGTERM gracefully
  const shutdown = async (signal: string): Promise<void> => {
    console.error(`[orchestrator] ${signal} получен — graceful shutdown...`);
    isShuttingDown = true;
    if (taskQueue.size > 0 || taskQueue.pending > 0) {
      console.error(`[orchestrator] Жду завершения текущей задачи...`);
      await taskQueue.onIdle();
    }
    persistMetrics();
    console.error('[orchestrator] Все задачи завершены. Выхожу.');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT',  () => void shutdown('SIGINT'));

  await tick();
  setInterval(tick, CONFIG.watchIntervalMs);
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const watch = process.argv.includes('--watch');
  if (watch) {
    watchMode().catch(err => { console.error('[orchestrator] FATAL:', err.message); process.exit(1); });
  } else {
    runOnce().then(() => process.exit(0)).catch(err => {
      console.error('[orchestrator] FATAL:', err.message); process.exit(1);
    });
  }
}
