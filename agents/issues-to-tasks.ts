/**
 * agents/issues-to-tasks.ts — GitHub Issues → TaskSpec конвертер
 *
 * Читает open issues из репо Rivega42/grandhub-feedback,
 * конвертирует их в TaskSpec и добавляет в queue.json.
 *
 * Использование:
 *   ts-node agents/issues-to-tasks.ts             # разовый прогон
 *   ts-node agents/issues-to-tasks.ts --watch     # каждые 5 минут
 *   ts-node agents/issues-to-tasks.ts --dry-run   # только показать
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { spawnSync } from 'child_process';

// ─── Конфиг ──────────────────────────────────────────────────────────────────

const CONFIG = {
  repo:          'Rivega42/grandhub-feedback',
  repoCode:      'Rivega42/grandhub-v3',
  stateDir:      path.resolve(__dirname, '../.agent-state'),
  queueFile:     path.resolve(__dirname, '../queue.json'),
  processedFile: path.resolve(__dirname, '../.agent-state/processed-issues.json'),
  ghToken:       process.env.GITHUB_TOKEN ?? '',
  watchIntervalMs: 5 * 60 * 1000,
  // Какие labels запускают агента
  actionLabels:  ['agent', 'auto-fix', 'coder'],
  // Маппинг: label → service в grandhub-v3
  serviceMap:    {
    'api-gateway':       'api-gateway',
    'auth':              'auth',
    'memory':            'memory',
    'notifications':     'notifications',
    'assistant-runtime': 'assistant-runtime',
    'websocket':         'websocket',
  } as Record<string, string>,
  defaultService: 'api-gateway',
} as const;

// ─── GitHub API ───────────────────────────────────────────────────────────────

function ghRequest(path: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.github.com',
      path,
      method: 'GET',
      headers: {
        'User-Agent':    'grandhub-agents/1.0',
        'Accept':        'application/vnd.github.v3+json',
        'Authorization': CONFIG.ghToken ? `token ${CONFIG.ghToken}` : '',
      },
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`JSON parse failed: ${data.slice(0, 100)}`)); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ─── Конвертация Issue → TaskSpec ────────────────────────────────────────────

function detectService(issue: any): string {
  const labels: string[] = (issue.labels ?? []).map((l: any) => l.name as string);
  const title: string = (issue.title ?? '').toLowerCase();
  const body: string = (issue.body ?? '').toLowerCase();

  // По label
  for (const [label, service] of Object.entries(CONFIG.serviceMap)) {
    if (labels.includes(label)) return service;
  }
  // По тексту
  for (const service of Object.values(CONFIG.serviceMap)) {
    if (title.includes(service) || body.includes(service)) return service;
  }
  return CONFIG.defaultService;
}

function detectType(issue: any): string {
  const labels: string[] = (issue.labels ?? []).map((l: any) => l.name as string);
  const title: string = (issue.title ?? '').toLowerCase();

  if (labels.includes('bug') || title.startsWith('fix') || title.startsWith('bug')) return 'fix';
  if (labels.includes('enhancement') || title.startsWith('feat')) return 'feat';
  if (labels.includes('refactor')) return 'refactor';
  return 'fix';
}

function buildCriteria(issue: any): string[] {
  const criteria: string[] = [];
  const body: string = issue.body ?? '';

  // Ищем чеклисты в теле issue
  const checkboxes = body.match(/- \[ \] (.+)/g);
  if (checkboxes) {
    checkboxes.slice(0, 5).forEach(cb => {
      criteria.push(cb.replace('- [ ] ', '').trim());
    });
  }

  // Базовые критерии всегда
  criteria.push('typecheck проходит без ошибок');
  criteria.push('lint проходит без ошибок');

  return criteria.length > 2 ? criteria : [
    `Проблема из issue #${issue.number} устранена`,
    'typecheck проходит без ошибок',
    'lint проходит без ошибок',
  ];
}

function issueToTaskSpec(issue: any): any {
  const service = detectService(issue);
  const type = detectType(issue);
  const taskId = `TASK-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-GH${issue.number}`;

  return {
    task_id: taskId,
    // Если title уже содержит conventional commit prefix — не дублируем
    title: /^(feat|fix|chore|refactor|docs|test)\(/.test(issue.title)
      ? issue.title
      : `${type}(${service}): ${issue.title}`,
    description: `GitHub Issue #${issue.number}: ${issue.title}\n\n${(issue.body ?? '').slice(0, 500)}`,
    service,
    type,
    priority: issue.labels?.some((l: any) => l.name === 'critical') ? 'critical' : 'medium',
    file_scope: [],  // LLM сам определит нужные файлы
    acceptance_criteria: buildCriteria(issue),
    allow_test_failure: false,
    max_retries: 3,
    escalation_threshold: 2,
    timeout_minutes: 30,
    cost_budget_usd: 2.0,
    created_at: new Date().toISOString(),
    github_issue: {
      number: issue.number,
      url: issue.html_url,
      author: issue.user?.login,
    },
  };
}

// ─── Processed issues tracking ────────────────────────────────────────────────

function loadProcessed(): Set<number> {
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG.processedFile, 'utf8'));
    return new Set<number>(data);
  } catch { return new Set<number>(); }
}

function saveProcessed(processed: Set<number>): void {
  fs.mkdirSync(CONFIG.stateDir, { recursive: true });
  fs.writeFileSync(CONFIG.processedFile, JSON.stringify([...processed]));
}

function loadQueue(): any[] {
  try { return JSON.parse(fs.readFileSync(CONFIG.queueFile, 'utf8')); }
  catch { return []; }
}

function saveQueue(queue: any[]): void {
  fs.writeFileSync(CONFIG.queueFile, JSON.stringify(queue, null, 2));
}

// ─── Основная логика ──────────────────────────────────────────────────────────

async function fetchAndQueue(dryRun = false): Promise<number> {
  console.error(`[issues] Проверяю ${CONFIG.repo}...`);

  const issues = await ghRequest(`/repos/${CONFIG.repo}/issues?state=open&per_page=20`);

  if (!Array.isArray(issues)) {
    console.error('[issues] Ошибка API:', JSON.stringify(issues).slice(0, 100));
    return 0;
  }

  console.error(`[issues] Открытых issues: ${issues.length}`);

  const processed = loadProcessed();
  const queue = loadQueue();
  let added = 0;

  for (const issue of issues) {
    if (processed.has(issue.number)) {
      console.error(`[issues] #${issue.number} уже в очереди — пропускаю`);
      continue;
    }

    const labels: string[] = (issue.labels ?? []).map((l: any) => l.name as string);
    const hasActionLabel = labels.some(l => CONFIG.actionLabels.includes(l as any));

    // Берём все issues если нет action label — но пропускаем вопросы (question label)
    if (labels.includes('question')) {
      console.error(`[issues] #${issue.number} — question, пропускаю`);
      continue;
    }

    const spec = issueToTaskSpec(issue);
    const specFile = path.join(CONFIG.stateDir, `${spec.task_id}-spec.json`);

    console.error(`[issues] #${issue.number} "${issue.title}" → ${spec.task_id} (${spec.service})`);

    if (dryRun) {
      console.log(JSON.stringify(spec, null, 2));
    } else {
      fs.mkdirSync(CONFIG.stateDir, { recursive: true });
      fs.writeFileSync(specFile, JSON.stringify(spec, null, 2));

      queue.push({
        task_id: spec.task_id,
        spec_file: specFile,
        status: 'pending',
        added_at: new Date().toISOString(),
        github_issue: issue.number,
      });

      processed.add(issue.number);
      added++;
      console.error(`[issues] Добавлено в очередь: ${spec.task_id}`);
    }
  }

  if (!dryRun) {
    saveQueue(queue);
    saveProcessed(processed);
    console.error(`[issues] Итого добавлено: ${added} задач`);
  }

  return added;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  const watch  = process.argv.includes('--watch');

  if (watch) {
    console.error(`[issues] Watch режим — каждые ${CONFIG.watchIntervalMs / 60000} мин`);
    const tick = () => fetchAndQueue(dryRun).catch(e => console.error('[issues] ERROR:', e.message));
    tick();
    setInterval(tick, CONFIG.watchIntervalMs);
  } else {
    fetchAndQueue(dryRun)
      .then(n => { console.error(`[issues] Done: ${n} added`); process.exit(0); })
      .catch(e => { console.error('[issues] FATAL:', e.message); process.exit(1); });
  }
}
