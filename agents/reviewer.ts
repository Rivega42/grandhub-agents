/**
 * agents/reviewer.ts — Reviewer агент
 *
 * Читает diff после Coder агента и оценивает качество изменений:
 * 1. Читает checkpoint Coder задачи
 * 2. Получает git diff из worktree или последнего коммита
 * 3. Отправляет diff + TaskSpec в LLM
 * 4. Сохраняет review.json в .agent-state/
 * 5. Если серьёзные проблемы — создаёт escalation
 *
 * Использование: ts-node agents/reviewer.ts --task-id <id>
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import * as https from 'https';

// ─── Типы ─────────────────────────────────────────────────────────────────────

interface ReviewIssue {
  severity: 'critical' | 'major' | 'minor' | 'info';
  file: string;
  line?: number;
  message: string;
  suggestion?: string;
}

interface ReviewResult {
  task_id: string;
  verdict: 'approve' | 'request_changes' | 'reject';
  score: number;           // 0-100
  summary: string;
  issues: ReviewIssue[];
  approved_for_merge: boolean;
  reviewed_at: string;
  reviewer: 'gha-reviewer-v1';
}

const CONFIG = {
  stateDir:     path.resolve(__dirname, '../.agent-state'),
  logsDir:      path.resolve(__dirname, '../.agent-logs'),
  repoRoot:     process.env.GRANDHUB_ROOT ?? '/opt/grandhub-v3',
  model:        'google/gemini-2.0-flash-001',
  openrouterKey: process.env.OPENROUTER_API_KEY ?? '',
} as const;

// ─── HTTP запрос к OpenRouter ─────────────────────────────────────────────────

async function callLLM(systemPrompt: string, userMessage: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: CONFIG.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage },
      ],
      max_tokens: 1500,
      temperature: 0.1,
    });

    const req = https.request({
      hostname: 'openrouter.ai',
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${CONFIG.openrouterKey}`,
        'HTTP-Referer':  'https://grandhub.ru',
        'X-Title':       'GrandHub Reviewer Agent',
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) { reject(new Error(json.error.message ?? JSON.stringify(json.error))); return; }
          resolve(json.choices[0].message.content as string);
        } catch (e) {
          reject(new Error(`Невалидный ответ: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Получение git diff ───────────────────────────────────────────────────────

function getDiff(taskId: string, service: string): string {
  // Пробуем worktree сначала
  const wtPath = path.join(CONFIG.repoRoot, 'worktrees', taskId);
  if (fs.existsSync(wtPath)) {
    const r = spawnSync('git', ['diff', 'main', '--', `services/${service}/`], {
      encoding: 'utf8', cwd: wtPath,
    });
    if (r.stdout) return r.stdout.slice(0, 20000);
  }

  // Fallback: последний коммит который упоминает taskId
  const log = spawnSync('git', ['log', '--oneline', '-20'], {
    encoding: 'utf8', cwd: CONFIG.repoRoot,
  });
  const commitLine = log.stdout.split('\n').find(l => l.includes(taskId));
  if (commitLine) {
    const hash = commitLine.split(' ')[0];
    const r = spawnSync('git', ['show', `${hash}`, '--stat', '-p', '--', `services/${service}/`], {
      encoding: 'utf8', cwd: CONFIG.repoRoot,
    });
    return r.stdout.slice(0, 20000);
  }

  return '(diff недоступен — нет worktree и коммит не найден)';
}

// ─── Парсинг ответа LLM ───────────────────────────────────────────────────────

function parseReviewResponse(raw: string, taskId: string): ReviewResult {
  const jsonBlock = raw.match(/```json\s*([\s\S]*?)\s*```/s);
  if (jsonBlock) {
    try { return JSON.parse(jsonBlock[1]) as ReviewResult; } catch { /* fallthrough */ }
  }
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try { return JSON.parse(raw.slice(first, last + 1)) as ReviewResult; } catch { /* fallthrough */ }
  }
  // Fallback
  return {
    task_id: taskId,
    verdict: 'request_changes',
    score: 0,
    summary: 'Не удалось распарсить ответ reviewer',
    issues: [{ severity: 'critical', file: '', message: raw.slice(0, 300) }],
    approved_for_merge: false,
    reviewed_at: new Date().toISOString(),
    reviewer: 'gha-reviewer-v1',
  };
}

// ─── Основная логика ──────────────────────────────────────────────────────────

export async function runReviewer(taskId: string): Promise<ReviewResult> {
  if (!CONFIG.openrouterKey) throw new Error('OPENROUTER_API_KEY не установлен');

  // Читаем TaskSpec
  const specFile = path.join(CONFIG.stateDir, `${taskId}-spec.json`);
  if (!fs.existsSync(specFile)) throw new Error(`TaskSpec не найден: ${specFile}`);
  const task = JSON.parse(fs.readFileSync(specFile, 'utf8'));

  console.error(`\n[reviewer] 🔍 Ревью задачи: ${taskId} — ${task.title}`);

  // Получаем diff
  const diff = getDiff(taskId, task.service);
  console.error(`[reviewer] 📄 Diff: ${diff.length} символов`);

  // Читаем checkpoint
  const checkpointFile = path.join(CONFIG.stateDir, `${taskId}.json`);
  const checkpoint = fs.existsSync(checkpointFile)
    ? JSON.parse(fs.readFileSync(checkpointFile, 'utf8'))
    : {};

  const systemPrompt = `Ты Reviewer агент системы GrandHub Agents (GHA).
Твоя задача — оценить качество изменений кода сделанных Coder агентом.
Будь конструктивен, конкретен, справедлив.
Отвечай ТОЛЬКО JSON в блоке \`\`\`json ... \`\`\`.`;

  const userMessage = `ЗАДАЧА:
ID: ${task.task_id}
Название: ${task.title}
Описание: ${task.description}

КРИТЕРИИ ПРИЁМКИ:
${task.acceptance_criteria.map((c: string, i: number) => `${i + 1}. ${c}`).join('\n')}

СТАТУС EVAL LOOP:
${checkpoint.status ?? 'неизвестен'}
eval_results: ${JSON.stringify(checkpoint.eval_results?.slice(-1) ?? [], null, 2)}

GIT DIFF:
\`\`\`diff
${diff}
\`\`\`

ФОРМАТ ОТВЕТА — строго JSON:
\`\`\`json
{
  "task_id": "${taskId}",
  "verdict": "approve" | "request_changes" | "reject",
  "score": 0-100,
  "summary": "краткое резюме что сделано и качество",
  "issues": [
    {
      "severity": "critical" | "major" | "minor" | "info",
      "file": "src/...",
      "line": 42,
      "message": "описание проблемы",
      "suggestion": "как исправить"
    }
  ],
  "approved_for_merge": true | false,
  "reviewed_at": "${new Date().toISOString()}",
  "reviewer": "gha-reviewer-v1"
}
\`\`\`

КРИТЕРИИ ОЦЕНКИ:
- Typecheck проходит → +30 очков
- Тесты не сломаны → +20 очков
- Минимальные изменения (не переписал весь файл зря) → +20 очков
- Правильные типы (не просто as any везде) → +20 очков
- Читаемый код → +10 очков
- critical issues → verdict = reject
- major issues → verdict = request_changes
- minor/info → verdict = approve`;

  console.error('[reviewer] 🤖 LLM ревью...');
  const raw = await callLLM(systemPrompt, userMessage);
  const review = parseReviewResponse(raw, taskId);

  // Сохраняем результат
  fs.mkdirSync(CONFIG.stateDir, { recursive: true });
  const reviewFile = path.join(CONFIG.stateDir, `${taskId}-review.json`);
  fs.writeFileSync(reviewFile, JSON.stringify(review, null, 2));

  console.error(`\n[reviewer] Вердикт: ${review.verdict.toUpperCase()} | Score: ${review.score}/100`);
  console.error(`[reviewer] ${review.summary}`);
  if (review.issues.length > 0) {
    console.error(`[reviewer] Issues (${review.issues.length}):`);
    review.issues.forEach(i => {
      console.error(`  [${i.severity.toUpperCase()}] ${i.file}: ${i.message}`);
    });
  }
  console.error(`[reviewer] approved_for_merge: ${review.approved_for_merge}`);
  console.log(JSON.stringify(review, null, 2));

  return review;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const taskIdIdx = args.indexOf('--task-id');

  if (taskIdIdx === -1 || !args[taskIdIdx + 1]) {
    console.error('Использование: ts-node agents/reviewer.ts --task-id <TASK-2026-XXXX-XXX>');
    process.exit(1);
  }

  runReviewer(args[taskIdIdx + 1])
    .then(r => process.exit(r.approved_for_merge ? 0 : 1))
    .catch(err => { console.error('[reviewer] FATAL:', err.message); process.exit(1); });
}
