/**
 * agents/coder.ts — Coder агент с полной LLM интеграцией
 * 
 * Полный цикл автономной работы:
 * 1. Читает TaskSpec
 * 2. Создаёт изолированный git worktree (scripts/worktree.sh)
 * 3. Захватывает блокировку сервиса (scripts/lock.sh)
 * 4. Собирает контекст (scripts/context-assemble.sh)
 * 5. Отправляет контекст + промпт в LLM (OpenRouter / Claude Sonnet)
 * 6. Применяет сгенерированные изменения к файлам
 * 7. Запускает eval-loop (scripts/eval-loop.sh)
 * 8. При ошибке — исправляет через LLM (до max_retries)
 * 9. При успехе — коммитит и создаёт PR
 * 10. При исчерпании попыток — создаёт escalation.json
 * 
 * Использование: npx ts-node agents/coder.ts --task-file <path> [--dry-run]
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import * as https from 'https';
import * as http from 'http';
import type {
  TaskSpec,
  CheckpointState,
  EvalLoopResult,
  EvalResult,
  EvalStep,
  EscalationReport,
  EscalationAttempt,
  AuditLogEntry,
} from '../types/task-spec';

// ─── Конфигурация ─────────────────────────────────────────────────────────────

const CONFIG = {
  scriptsDir:   path.resolve(__dirname, '../scripts'),
  stateDir:     path.resolve(__dirname, '../.agent-state'),
  logsDir:      path.resolve(__dirname, '../.agent-logs'),
  repoStateDir: path.join(process.env.GRANDHUB_ROOT ?? '/opt/grandhub-v3', '.agent-state'),
  repoRoot:     process.env.GRANDHUB_ROOT ?? '/opt/grandhub-v3',
  model:        'anthropic/claude-sonnet-4-5',
  openrouterKey: process.env.OPENROUTER_API_KEY ?? '',
  maxRetries:   3,
} as const;

// ─── Типы LLM ─────────────────────────────────────────────────────────────────

interface FileChange {
  path: string;      // относительный путь внутри сервиса
  content: string;   // полное содержимое файла
  action: 'create' | 'modify' | 'delete';
}

interface LLMResponse {
  changes: FileChange[];
  explanation: string;
  confidence: 'high' | 'medium' | 'low';
}

// ─── Вспомогательные функции ──────────────────────────────────────────────────

function runScript<T>(scriptName: string, args: string[], cwd?: string): T {
  const scriptPath = path.join(CONFIG.scriptsDir, scriptName);
  const result = spawnSync('bash', [scriptPath, ...args], {
    encoding: 'utf8',
    cwd: cwd ?? CONFIG.repoRoot,
    env: { ...process.env, GRANDHUB_ROOT: CONFIG.repoRoot },
  });
  if (result.status !== 0) {
    throw new Error(`${scriptName} завершился с кодом ${result.status}: ${result.stderr?.slice(0, 500)}`);
  }
  return JSON.parse(result.stdout) as T;
}

function saveCheckpoint(state: CheckpointState): void {
  fs.mkdirSync(CONFIG.stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(CONFIG.stateDir, `${state.task_id}.json`),
    JSON.stringify(state, null, 2)
  );
}

function loadCheckpoint(taskId: string): CheckpointState | null {
  const file = path.join(CONFIG.stateDir, `${taskId}.json`);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as CheckpointState; }
  catch { return null; }
}

function auditLog(taskId: string, entry: Omit<AuditLogEntry, 'task_id' | 'timestamp'>): void {
  fs.mkdirSync(CONFIG.logsDir, { recursive: true });
  const record: AuditLogEntry = { timestamp: new Date().toISOString(), task_id: taskId, ...entry };
  fs.appendFileSync(path.join(CONFIG.logsDir, `${taskId}.jsonl`), JSON.stringify(record) + '\n');
}

// ─── HTTP запрос к OpenRouter ─────────────────────────────────────────────────

async function callLLM(systemPrompt: string, userMessage: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: CONFIG.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage },
      ],
      max_tokens: 12000,
      temperature: 0.1,
    });


  const baseUrl = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai';
  const isLocal = baseUrl.startsWith('http://');
  const parsedUrl = new URL(baseUrl);
  const requester = isLocal ? http : https;
  const apiPath = isLocal ? '/v1/chat/completions' : '/api/v1/chat/completions';
    const req = requester.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port ? parseInt(parsedUrl.port) : (isLocal ? 80 : 443),
      path: apiPath,
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${CONFIG.openrouterKey}`,
        'HTTP-Referer':  'https://grandhub.ru',  // ignored by OpenClaw
        'X-Title':       'GrandHub Coder Agent',
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
          reject(new Error(`Невалидный ответ LLM: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Парсинг ответа LLM ───────────────────────────────────────────────────────

function parseLLMResponse(raw: string): LLMResponse {
  // Стратегия 1: блок ```json ... ```
  const jsonBlock = raw.match(/```json\s*([\s\S]*?)\s*```/s);
  if (jsonBlock) {
    try { return JSON.parse(jsonBlock[1]) as LLMResponse; } catch { /* fallthrough */ }
  }

  // Стратегия 2: ищем { ... } от первой { до последней }
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(raw.slice(firstBrace, lastBrace + 1)) as LLMResponse; } catch { /* fallthrough */ }
  }

  // Стратегия 3: весь ответ как JSON
  try { return JSON.parse(raw) as LLMResponse; } catch { /* fallthrough */ }

  // Fallback
  console.error('[coder] ⚠️  Не удалось распарсить ответ LLM как JSON');
  return { changes: [], explanation: raw.slice(0, 500), confidence: 'low' };
}

// ─── Применение изменений к файлам ───────────────────────────────────────────

function applyChanges(changes: FileChange[], serviceDir: string): string[] {
  const applied: string[] = [];

  for (const change of changes) {
    const fullPath = path.join(serviceDir, change.path);
    const dir = path.dirname(fullPath);

    if (change.action === 'delete') {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        applied.push(`DELETE ${change.path}`);
        console.error(`[coder] 🗑  Удалён: ${change.path}`);
      }
    } else {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullPath, change.content, 'utf8');
      applied.push(`${change.action.toUpperCase()} ${change.path}`);
      console.error(`[coder] ✏️  ${change.action === 'create' ? 'Создан' : 'Изменён'}: ${change.path}`);
    }
  }

  return applied;
}

// ─── Формирование промпта для LLM ────────────────────────────────────────────

function buildImplementPrompt(contextContent: string, task: TaskSpec, fileBatch: string[]): string {
  return `Тебе дан контекст сервиса и задача. Реализуй изменения.

ЗАДАЧА: ${task.title}
${task.description}

КРИТЕРИИ ПРИЁМКИ:
${task.acceptance_criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

ФАЙЛЫ ДЛЯ ИЗМЕНЕНИЯ В ЭТОМ БАТЧЕ (${fileBatch.length} из ${task.file_scope.length}):
${fileBatch.join('\n')}

КОНТЕКСТ СЕРВИСА:
${contextContent}

ФОРМАТ ОТВЕТА — строго JSON в блоке \`\`\`json ... \`\`\`:
\`\`\`json
{
  "changes": [
    {
      "path": "относительный/путь/от/корня/сервиса.ts",
      "content": "полное содержимое файла",
      "action": "create" | "modify" | "delete"
    }
  ],
  "explanation": "что и почему изменено",
  "confidence": "high" | "medium" | "low"
}
\`\`\`

ПРАВИЛА:
- Изменяй ТОЛЬКО файлы из file_scope
- Возвращай ПОЛНОЕ содержимое файла, не diff
- Если файлов много — верни первые 3-4 самых важных, остальные в следующем ответе
- TypeScript strict mode, named exports, no any
- Используй AppError для ошибок
- Пиши тесты если они в acceptance_criteria
- ВАЖНО: JSON должен быть полным и закрытым, не обрезай его`;
}

function buildFixPrompt(contextContent: string, task: TaskSpec, evalResult: EvalLoopResult, attempt: number): string {
  const errors = evalResult.steps
    .filter(s => !s.passed)
    .flatMap(s => s.errors.map(e => `[${s.step}] ${e.file}:${e.line ?? '?'} — ${e.message}`))
    .join('\n');

  return `Попытка исправить ошибки (попытка ${attempt}/${task.max_retries}).

ИСХОДНАЯ ЗАДАЧА: ${task.title}

ОШИБКИ EVAL LOOP:
${errors || 'Неизвестные ошибки — смотри explanation'}

${contextContent}

ФОРМАТ ОТВЕТА — строго JSON в блоке \`\`\`json ... \`\`\`:
\`\`\`json
{
  "changes": [...],
  "explanation": "что именно исправлено",
  "confidence": "high" | "medium" | "low"
}
\`\`\`

ПРАВИЛА: исправляй только те файлы которые вызывают ошибки. Возвращай полное содержимое файла.`;
}

// ─── Основная логика ──────────────────────────────────────────────────────────

export async function runCoder(taskFile: string, dryRun = false): Promise<boolean> {
  if (!CONFIG.openrouterKey) {
    throw new Error('OPENROUTER_API_KEY не установлен. Добавь в env.');
  }

  const task: TaskSpec = JSON.parse(fs.readFileSync(taskFile, 'utf8'));
  const serviceDir = path.join(CONFIG.repoRoot, 'services', task.service);

  console.error(`\n[coder] 🚀 Задача: ${task.task_id} — ${task.title}`);
  console.error(`[coder] Сервис: ${task.service} (${serviceDir})`);

  let state: CheckpointState = loadCheckpoint(task.task_id) ?? {
    task_id: task.task_id,
    status: 'in_progress',
    current_step: 'init',
    steps_completed: [],
    steps_remaining: ['worktree', 'lock', 'context', 'implement', 'eval', 'commit'],
    errors: [],
    retries: 0,
    tokens_used: { input: 0, output: 0, cost_usd: 0 },
    git_commits: [],
    eval_results: [],
    last_updated: new Date().toISOString(),
  };

  // Если задача уже выполнена — не запускаем повторно
  if (state.status === 'done' || state.status === 'review') {
    console.error();
    return true;
  }

  if (dryRun) {
    console.log(JSON.stringify({ dry_run: true, task_id: task.task_id }, null, 2));
    return true;
  }

  // 1. Создаём изолированный worktree
  console.error('[coder] 🌿 Создаю git worktree...');
  let worktreePath = serviceDir; // fallback — работаем напрямую если worktree не нужен
  try {
    const wtPath = path.join(CONFIG.repoRoot, 'worktrees', task.task_id);
    const branchName = `agent/${task.task_id}`;
    // Создаём worktree напрямую через git — без парсинга stdout
    const wtResult = spawnSync('git', ['worktree', 'add', wtPath, '-b', branchName, 'main'], {
      encoding: 'utf8', cwd: CONFIG.repoRoot,
    });
    if (wtResult.status === 0 || wtResult.stderr?.includes('already exists')) {
      worktreePath = path.join(wtPath, 'services', task.service);
      console.error(`[coder] Worktree: ${wtPath}`);
    } else {
      throw new Error(wtResult.stderr ?? 'unknown');
    }
  } catch (e) {
    console.error('[coder] ⚠️  Worktree не создан, работаю в основном репо:', (e as Error).message);
  }

  // 2. Захватываем блокировку
  console.error(`[coder] 🔒 Захват блокировки: ${task.service}`);
  try {
    runScript('lock.sh', ['acquire', '--service', task.service, '--task-id', task.task_id]);
  } catch {
    console.error('[coder] ⚠️  Не удалось захватить блокировку, продолжаю без неё');
  }

  const attempts: EscalationAttempt[] = [];

  try {
    // 3. Собираем контекст
    console.error('[coder] 📚 Сборка контекста...');
    const ctxResult = runScript<{ success: boolean; context_file: string }>(
      'context-assemble.sh',
      ['--service', task.service, '--task-id', task.task_id, '--task-file', taskFile]
    );
    const contextContent = ctxResult.context_file && fs.existsSync(ctxResult.context_file)
      ? fs.readFileSync(ctxResult.context_file, 'utf8')
      : `Сервис: ${task.service}\nФайлы: ${task.file_scope.join(', ')}`;

    auditLog(task.task_id, { agent_role: 'coder', action: 'file_read', details: { context: ctxResult.context_file } });

    // 4. Батчинг file_scope — максимум BATCH_SIZE файлов за один LLM вызов
    const BATCH_SIZE = 4;
    const fileBatches: string[][] = [];
    for (let i = 0; i < task.file_scope.length; i += BATCH_SIZE) {
      fileBatches.push(task.file_scope.slice(i, i + BATCH_SIZE));
    }
    console.error(`[coder] 📦 Батчей: ${fileBatches.length} (${BATCH_SIZE} файлов макс)`);

    // Применяем все батчи — собираем все изменения перед eval
    let allApplied: string[] = [];
    for (let batchIdx = 0; batchIdx < fileBatches.length; batchIdx++) {
      const fileBatch = fileBatches[batchIdx];
      console.error(`[coder] 📂 Батч ${batchIdx + 1}/${fileBatches.length}: ${fileBatch.join(', ')}`);

      const batchPrompt = buildImplementPrompt(contextContent, task, fileBatch);
      let rawBatch: string;
      try {
        rawBatch = await callLLM(
          fs.existsSync(path.join(__dirname, '../prompts/coder.md'))
            ? fs.readFileSync(path.join(__dirname, '../prompts/coder.md'), 'utf8')
            : 'Ты Coder агент GrandHub. Пиши TypeScript код строго по инструкции.',
          batchPrompt
        );
      } catch (e) {
        console.error(`[coder] ❌ LLM ошибка в батче ${batchIdx + 1}: ${(e as Error).message}`);
        continue;
      }
      const batchResponse = parseLLMResponse(rawBatch);
      console.error(`[coder] Батч ${batchIdx + 1} — Confidence: ${batchResponse.confidence} | Changes: ${batchResponse.changes.length}`);
      if (batchResponse.changes.length > 0) {
        const applied = applyChanges(batchResponse.changes, worktreePath);
        allApplied = allApplied.concat(applied);
      }
    }

    if (allApplied.length === 0) {
      console.error('[coder] ⚠️  Ни один батч не вернул изменений — эскалация');
      state.status = 'escalated';
      saveCheckpoint(state);
    }

    auditLog(task.task_id, { agent_role: 'coder', action: 'file_write', details: { files: allApplied } });

    // 5. Основной цикл eval + fix
    let lastEvalResult: EvalLoopResult | null = null;
    let isFirstAttempt = true;

    while (state.retries < (task.max_retries ?? CONFIG.maxRetries)) {
      state.current_step = `attempt_${state.retries + 1}`;
      state.last_updated = new Date().toISOString();
      saveCheckpoint(state);

      // После первого eval — фиксим ошибки через LLM (без батчей — точечные правки)
      if (lastEvalResult !== null && !lastEvalResult.passed) {
        console.error(`\n[coder] 🔧 Fix LLM (попытка ${state.retries + 1}/${task.max_retries})...`);
        const fixPrompt = buildFixPrompt(contextContent, task, lastEvalResult, state.retries + 1);
        let rawFix: string;
        try {
          rawFix = await callLLM(
            fs.existsSync(path.join(__dirname, '../prompts/coder.md'))
              ? fs.readFileSync(path.join(__dirname, '../prompts/coder.md'), 'utf8')
              : 'Ты Coder агент GrandHub. Пиши TypeScript код строго по инструкции.',
            fixPrompt
          );
        } catch (e) {
          console.error(`[coder] ❌ LLM ошибка: ${(e as Error).message}`);
          state.retries++;
          continue;
        }
        const fixResponse = parseLLMResponse(rawFix);
        console.error(`[coder] Fix — Confidence: ${fixResponse.confidence} | Changes: ${fixResponse.changes.length}`);
        if (fixResponse.changes.length > 0) {
          applyChanges(fixResponse.changes, worktreePath);
        }
      }

      // Запускаем eval loop
      console.error('[coder] 🧪 Запуск eval loop...');
      let evalResult: EvalLoopResult;
      try {
        // Запускаем каждый шаг отдельно
        const evalSteps: EvalResult[] = [];
        let evalPassed = true;
        const stepsToRun: EvalStep[] = ['lint', 'typecheck', 'test'];

        for (const stepName of stepsToRun) {
          const stepScript = path.join(CONFIG.scriptsDir, `${stepName}.sh`);
          const stepStart = Date.now();
          const stepRaw = spawnSync('bash', [stepScript, task.service], {
            encoding: 'utf8',
            cwd: path.dirname(worktreePath),
            env: { ...process.env, GRANDHUB_ROOT: CONFIG.repoRoot },
            timeout: 300000,
          });

          let stepSuccess = false;
          let stepErrors: Array<{file: string; line?: number; message: string}> = [];
          try {
            const jqResult = spawnSync('jq', ['-c', '.'], {
              input: stepRaw.stdout ?? '',
              encoding: 'utf8',
            });
            const stepJson = JSON.parse(jqResult.stdout?.trim() ?? '{}');
            stepSuccess = stepJson.success ?? false;
            stepErrors = (stepJson.errors ?? []).slice(0, 5).map((e: any) =>
              typeof e === 'string'
                ? { file: '', line: 0, message: e.slice(0, 200) }
                : { file: e.file ?? '', line: e.line, message: String(e.message ?? '').slice(0, 200) }
            );
          } catch {
            stepSuccess = (stepRaw.status ?? 1) === 0;
            if (!stepSuccess) stepErrors = [{ file: '', message: (stepRaw.stderr ?? '').slice(0, 200) }];
          }

          const stepResult: EvalResult = {
            step: stepName,
            passed: stepSuccess,
            duration_ms: Date.now() - stepStart,
            timestamp: new Date().toISOString(),
            errors: stepErrors,
          };
          evalSteps.push(stepResult);

          if (!stepSuccess) {
            if (stepName === 'test' && task.allow_test_failure) {
              console.error(`[coder] \u26a0\ufe0f  test failed - allow_test_failure, continuing`);
            } else {
              evalPassed = false;
              console.error(`[coder] \u274c ${stepName} failed`);
              break;
            }
          } else {
            console.error(`[coder] \u2705 ${stepName} OK`);
          }
        }

        evalResult = {
          task_id: task.task_id,
          service: task.service,
          passed: evalPassed,
          steps: evalSteps,
          total_duration_ms: evalSteps.reduce((s, r) => s + r.duration_ms, 0),
          timestamp: new Date().toISOString(),
        };
      } catch (e) {
        evalResult = {
          task_id: task.task_id, service: task.service, passed: false,
          steps: [{ step: 'lint', passed: false, duration_ms: 0, errors: [{ file: '', message: (e as Error).message }], timestamp: new Date().toISOString() }],
          total_duration_ms: 0, timestamp: new Date().toISOString(),
        };
      }

      lastEvalResult = evalResult;
      state.eval_results.push(evalResult as any);
      auditLog(task.task_id, { agent_role: 'coder', action: 'eval_run', details: { passed: evalResult.passed } });

      // allow_test_failure: если только test провалился — считаем успехом
      const criticalFailed = evalResult.steps.filter(s => {
        if (!s.passed && s.step === 'test' && task.allow_test_failure) return false;
        return !s.passed;
      });
      const effectivePassed = evalResult.passed || criticalFailed.length === 0;

      if (effectivePassed) {
        // ✅ Успех — коммитим
        console.error('\n[coder] ✅ Eval loop прошёл! Коммичу...');

        const commitMsg = `${task.type}(${task.service}): ${task.title} [${task.task_id}]`;
        spawnSync('git', ['add', '-A'], { cwd: path.dirname(worktreePath) ?? CONFIG.repoRoot, encoding: 'utf8' });
        const commit = spawnSync('git', ['commit', '-m', commitMsg], { cwd: path.dirname(worktreePath) ?? CONFIG.repoRoot, encoding: 'utf8' });

        if (commit.status === 0) {
          const hash = commit.stdout.match(/\[.+ ([a-f0-9]+)\]/)?.[1] ?? 'unknown';
          state.git_commits.push(hash);
          console.error(`[coder] 📦 Commit: ${hash}`);
          auditLog(task.task_id, { agent_role: 'coder', action: 'git_commit', details: { hash, message: commitMsg } });

          // Создаём PR через gh CLI
          try {
            const wtRoot = path.dirname(worktreePath);
            // Пушим ветку
            spawnSync('git', ['push', 'origin', `agent/${task.task_id}`, '--force'], {
              encoding: 'utf8', cwd: wtRoot,
              env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
              timeout: 30000,
            });
            const issueRef = (task as any).github_issue?.number
              ? `\n\nCloses #${(task as any).github_issue.number} (в grandhub-feedback)`
              : '';
            const prBody = `🤖 Автоматически создан GHA Coder агентом\n\n**Задача:** ${task.task_id}\n**Сервис:** ${task.service}\n\n${task.description.slice(0, 500)}${issueRef}`;
            const pr = spawnSync('gh', ['pr', 'create',
              '--title', commitMsg,
              '--body', prBody,
              '--base', 'main',
              '--head', `agent/${task.task_id}`,
            ], {
              encoding: 'utf8', cwd: wtRoot,
              env: { ...process.env, GH_TOKEN: process.env.GITHUB_TOKEN ?? '' },
              timeout: 30000,
            });
            const prUrl = pr.stdout?.trim();
            if (prUrl && prUrl.startsWith('https://')) {
              state.git_commits.push(`PR: ${prUrl}`);
              console.error(`[coder] 🔗 PR создан: ${prUrl}`);
              auditLog(task.task_id, { agent_role: 'coder', action: 'pr_created', details: { url: prUrl } });
            } else {
              console.error('[coder] ⚠️  PR не создан:', (pr.stderr ?? '').slice(0, 100));
            }
          } catch (prErr) {
            console.error('[coder] ⚠️  PR ошибка:', (prErr as Error).message);
          }
        }

        state.status = 'review';
        state.current_step = 'reviewer';
        saveCheckpoint(state);

        console.error(`\n[coder] 🎉 Задача ${task.task_id} выполнена! Запускаю Reviewer...`);

        // Автозапуск Reviewer
        try {
          const reviewerScript = path.resolve(__dirname, '../run-reviewer.sh');
          const reviewResult = spawnSync('bash', [reviewerScript, '--task-id', task.task_id], {
            encoding: 'utf8', timeout: 120000,
          });
          const reviewJson = reviewResult.stdout ? JSON.parse(reviewResult.stdout) : null;
          if (reviewJson) {
            console.error(`[coder] 🔍 Reviewer: ${reviewJson.verdict.toUpperCase()} | Score: ${reviewJson.score}/100`);
            if (reviewJson.verdict === 'reject' && state.retries < (task.max_retries ?? CONFIG.maxRetries)) {
              console.error('[coder] ↩️  Reviewer отклонил — передаю фидбек в следующую попытку...');
              const reviewIssues = reviewJson.issues
                .map((i: {severity: string; file: string; message: string}) => `[${i.severity}] ${i.file}: ${i.message}`)
                .join('\n');
              state.errors = [{ file: 'reviewer', line: 0, message: reviewIssues }];
              state.retries++;
              state.status = 'running';
              state.current_step = `attempt_${state.retries + 1}_reviewer_feedback`;
              saveCheckpoint(state);
              // Продолжаем цикл с фидбеком от reviewer (не выходим)
              isFirstAttempt = false;
              lastEvalResult = { task_id: task.task_id, service: task.service, passed: false, total_duration_ms: 0, timestamp: new Date().toISOString(), steps: [{ step: 'test' as const, passed: false, duration_ms: 0, timestamp: new Date().toISOString(), errors: [{ file: 'reviewer', line: 0, message: reviewIssues }] }] };
              continue;
            }
            state.status = reviewJson.approved_for_merge ? 'done' : 'review';
          } else {
            console.error('[coder] ⚠️  Reviewer вернул пустой ответ');
            state.status = 'done';
          }
        } catch (e) {
          console.error('[coder] ⚠️  Reviewer упал:', (e as Error).message);
          state.status = 'done';
        }

        state.current_step = 'done';
        saveCheckpoint(state);
        return true;
      }

      // ❌ Eval провалился
      const firstFailed = evalResult.steps.find(s => !s.passed && !(s.step === 'test' && task.allow_test_failure));
      const errorSummary = firstFailed?.errors[0]
        ? `[${firstFailed.step}] ${firstFailed.errors[0].file}:${firstFailed.errors[0].line} — ${firstFailed.errors[0].message}`
        : `${firstFailed?.step ?? 'unknown'} провалился`;

      console.error(`[coder] ❌ ${errorSummary}`);

      attempts.push({
        attempt_number: state.retries + 1,
        error_summary: errorSummary,
        fix_tried: 'LLM fix attempt',
        eval_result: evalResult,
      });

      state.errors = firstFailed?.errors ?? [];
      state.retries++;
      saveCheckpoint(state);
    }

    // Исчерпаны все попытки — эскалация
    console.error(`\n[coder] 🚨 Исчерпаны все попытки. Эскалация...`);
    state.status = 'escalated';
    saveCheckpoint(state);

    const report: EscalationReport = {
      task_id: task.task_id, title: task.title, service: task.service,
      escalation_level: 'human', attempts,
      last_error: attempts[attempts.length - 1]?.error_summary ?? 'Неизвестная ошибка',
      cost_so_far_usd: state.tokens_used.cost_usd,
      suggested_actions: ['fix_manually', 'provide_guidance', 'defer'],
      created_at: new Date().toISOString(),
    };

    fs.writeFileSync(path.join(CONFIG.stateDir, `${task.task_id}-escalation.json`), JSON.stringify(report, null, 2));
    auditLog(task.task_id, { agent_role: 'coder', action: 'escalation', details: report as unknown as Record<string, unknown> });
    console.log(JSON.stringify(report, null, 2));
    return false;

  } finally {
    try { runScript('lock.sh', ['release', '--service', task.service, '--task-id', task.task_id]); }
    catch { /* молча */ }
  }
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const taskFileIdx = args.indexOf('--task-file');
  const dryRun = args.includes('--dry-run');

  if (taskFileIdx === -1 || !args[taskFileIdx + 1]) {
    console.error('Использование: ts-node agents/coder.ts --task-file <path> [--dry-run]');
    process.exit(1);
  }

  runCoder(args[taskFileIdx + 1], dryRun)
    .then(ok => process.exit(ok ? 0 : 1))
    .catch(err => { console.error('[coder] FATAL:', err.message); process.exit(1); });
}
