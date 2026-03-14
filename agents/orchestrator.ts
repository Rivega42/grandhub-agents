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
import { spawnSync, spawn } from 'child_process';
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
}

// ─── Telegram уведомления ─────────────────────────────────────────────────────

function tgSend(text: string): void {
  if (!CONFIG.tgBotToken) return;
  const body = JSON.stringify({ chat_id: CONFIG.tgChatId, text, parse_mode: 'HTML' });
  const req = https.request({
    hostname: 'api.telegram.org',
    path: `/bot${CONFIG.tgBotToken}/sendMessage`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, () => {});
  req.on('error', () => {});
  req.write(body);
  req.end();
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

function runTask(entry: QueueEntry, queue: QueueEntry[]): void {
  const idx = queue.findIndex(e => e.task_id === entry.task_id);
  if (idx === -1) return;

  queue[idx].status = 'running';
  queue[idx].started_at = new Date().toISOString();
  saveQueue(queue);

  // Читаем TaskSpec для красивого уведомления
  let title = entry.task_id;
  try { title = JSON.parse(fs.readFileSync(entry.spec_file, 'utf8')).title ?? title; } catch { /* ok */ }

  console.error(`\n[orchestrator] 🚀 Запуск: ${entry.task_id} — ${title}`);
  tgSend(`🤖 <b>GHA Coder запущен</b>\n📋 ${entry.task_id}\n📝 ${title}`);

  const coderScript = path.join(CONFIG.scriptDir, 'run-coder.sh');
  const result = spawnSync('bash', [coderScript, '--task-file', entry.spec_file], {
    encoding: 'utf8',
    timeout: 30 * 60 * 1000, // 30 минут максимум
    stdio: ['ignore', 'pipe', 'pipe'],
  });

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
      tgSend(`✅ <b>GHA задача выполнена</b>\n📋 ${entry.task_id}\n📝 ${title}\n⭐ Score: ${reviewScore}/100\n🔍 Reviewer: одобрено`);
    } else {
      queue[idx].status = 'done';
      queue[idx].result = 'reviewer_rejected';
      queue[idx].score = reviewScore;
      console.error(`[orchestrator] ⚠️ ${entry.task_id} — done, reviewer: ${reviewVerdict} (score: ${reviewScore})`);
      tgSend(`⚠️ <b>GHA задача завершена</b> (требует ревью)\n📋 ${entry.task_id}\n📝 ${title}\n⭐ Score: ${reviewScore}/100\n🔍 Reviewer: ${reviewVerdict}`);
    }
  } else {
    // Проверяем escalation
    const escalFile = path.join(CONFIG.stateDir, `${entry.task_id}-escalation.json`);
    const isEscalated = fs.existsSync(escalFile);

    queue[idx].status = 'failed';
    queue[idx].result = isEscalated ? 'escalated' : 'escalated';
    console.error(`[orchestrator] ❌ ${entry.task_id} — FAILED${isEscalated ? ' (escalated)' : ''}`);

    let lastError = '';
    if (isEscalated) {
      try { lastError = JSON.parse(fs.readFileSync(escalFile, 'utf8')).last_error ?? ''; } catch { /* ok */ }
    }

    tgSend(`❌ <b>GHA задача провалена</b>\n📋 ${entry.task_id}\n📝 ${title}${lastError ? `\n🔴 ${lastError.slice(0, 200)}` : ''}\n\nНужно ручное вмешательство.`);
  }

  saveQueue(queue);
  // Логируем stderr в файл
  fs.mkdirSync(CONFIG.logsDir, { recursive: true });
  fs.appendFileSync(
    path.join(CONFIG.logsDir, `${entry.task_id}.log`),
    `\n=== Orchestrator run ${new Date().toISOString()} ===\n${result.stderr ?? ''}`
  );
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
    runTask(entry, queue);
  }

  console.error('[orchestrator] Все задачи обработаны.');
}

async function watchMode(): Promise<void> {
  console.error(`[orchestrator] 👀 Watch режим — проверяю каждые ${CONFIG.watchIntervalMs / 1000}с`);
  tgSend('🤖 <b>GHA Orchestrator запущен</b> (watch режим)');

  const tick = async () => {
    const queue = loadQueue();
    const pending = pendingTasks(queue);
    if (pending.length > 0) {
      console.error(`[orchestrator] Новых задач: ${pending.length}`);
      for (const entry of pending) {
        runTask(entry, queue);
      }
    }
  };

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
