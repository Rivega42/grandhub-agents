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
  console.error(`[orchestrator] 🚀 Запуск: ${entry.task_id} — ${title}`);

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
      // Достаём PR url из checkpoint
      let prUrl: string | undefined;
      try {
        const cpFile = path.join(CONFIG.stateDir, `${entry.task_id}.json`);
        const cp = JSON.parse(fs.readFileSync(cpFile, 'utf8'));
        const prEntry = (cp.git_commits ?? []).find((s: string) => s.startsWith('PR: '));
        if (prEntry) prUrl = (prEntry as string).replace('PR: ', '').trim();
      } catch { /* ignore */ }
      notifyCompletion(entry, 'done', { score: reviewScore, verdict: 'approved', pr_url: prUrl });
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
      queue[idx].status = 'done';
      queue[idx].result = 'reviewer_rejected';
      queue[idx].score = reviewScore;
      console.error(`[orchestrator] ⚠️ ${entry.task_id} — done, reviewer: ${reviewVerdict} (score: ${reviewScore})`);
      notifyCompletion(entry, 'review', { score: reviewScore, verdict: reviewVerdict });
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

    notifyCompletion(entry, 'failed', { error: lastError?.slice(0, 300) });
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
  console.error('[orchestrator] 🤖 GHA Orchestrator запущен (watch режим)');

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
