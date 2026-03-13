/**
 * coder.ts — Coder агент GrandHub Agents
 * Принимает TaskSpec, собирает контекст, запускает eval-loop, делает до 3 попыток.
 * При исчерпании попыток создаёт escalation.json для Orchestrator/Human.
 * Модель: Sonnet (claude-sonnet-4), лимит контекста 30K токенов.
 *
 * Использование: npx ts-node agents/coder.ts --task-file <path> [--dry-run]
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawnSync } from 'child_process';
import type {
  TaskSpec,
  CheckpointState,
  EvalLoopResult,
  EscalationReport,
  EscalationAttempt,
  AuditLogEntry,
  TokenUsage,
} from '../types/task-spec';

// ─── Конфигурация ─────────────────────────────────────────────────────────────

const CONFIG = {
  scriptsDir: path.resolve(__dirname, '../scripts'),
  stateDir: path.resolve(__dirname, '../.agent-state'),
  logsDir: path.resolve(__dirname, '../.agent-logs'),
  locksDir: path.resolve(__dirname, '../.agent-locks'),
  repoRoot: '/opt/grandhub-v3',
  maxRetries: 3,
  model: 'claude-sonnet-4',
} as const;

// ─── Вспомогательные функции ──────────────────────────────────────────────────

/** Запуск скрипта и парсинг JSON вывода */
function runScript<T>(scriptName: string, args: string[]): T {
  const scriptPath = path.join(CONFIG.scriptsDir, scriptName);
  const result = spawnSync('bash', [scriptPath, ...args], {
    encoding: 'utf8',
    cwd: CONFIG.repoRoot,
  });

  if (result.status !== 0) {
    throw new Error(`Скрипт ${scriptName} завершился с кодом ${result.status}: ${result.stderr}`);
  }

  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    throw new Error(`Скрипт ${scriptName} вернул невалидный JSON: ${result.stdout}`);
  }
}

/** Сохранение чекпойнта */
function saveCheckpoint(state: CheckpointState): void {
  const file = path.join(CONFIG.stateDir, `${state.task_id}.json`);
  fs.mkdirSync(CONFIG.stateDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
  console.error(`[checkpoint] Сохранён: ${file}`);
}

/** Загрузка чекпойнта */
function loadCheckpoint(taskId: string): CheckpointState | null {
  const file = path.join(CONFIG.stateDir, `${taskId}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as CheckpointState;
  } catch {
    return null;
  }
}

/** Запись в audit log */
function auditLog(taskId: string, entry: Omit<AuditLogEntry, 'task_id' | 'timestamp'>): void {
  const logFile = path.join(CONFIG.logsDir, `${taskId}.jsonl`);
  fs.mkdirSync(CONFIG.logsDir, { recursive: true });
  const record: AuditLogEntry = {
    timestamp: new Date().toISOString(),
    task_id: taskId,
    ...entry,
  };
  fs.appendFileSync(logFile, JSON.stringify(record) + '\n');
}

/** Захват блокировки сервиса */
function acquireLock(service: string, taskId: string): boolean {
  try {
    const result = runScript<{ success: boolean }>('lock.sh', [
      'acquire',
      '--service', service,
      '--task-id', taskId,
    ]);
    return result.success;
  } catch {
    return false;
  }
}

/** Освобождение блокировки */
function releaseLock(service: string, taskId: string): void {
  try {
    runScript('lock.sh', ['release', '--service', service, '--task-id', taskId]);
  } catch {
    console.error(`[lock] Не удалось освободить блокировку ${service}`);
  }
}

/** Запуск eval loop */
function runEvalLoop(service: string, taskId: string): EvalLoopResult {
  return runScript<EvalLoopResult>('eval-loop.sh', [
    '--service', service,
    '--task-id', taskId,
  ]);
}

/** Создание отчёта об эскалации */
function createEscalationReport(
  task: TaskSpec,
  attempts: EscalationAttempt[],
  costUsd: number,
): EscalationReport {
  const report: EscalationReport = {
    task_id: task.task_id,
    title: task.title,
    service: task.service,
    escalation_level: 'human',
    attempts,
    last_error: attempts[attempts.length - 1]?.error_summary ?? 'Неизвестная ошибка',
    cost_so_far_usd: costUsd,
    suggested_actions: ['fix_manually', 'provide_guidance', 'defer'],
    created_at: new Date().toISOString(),
  };

  const reportFile = path.join(CONFIG.stateDir, `${task.task_id}-escalation.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.error(`[escalation] Отчёт сохранён: ${reportFile}`);

  return report;
}

/** Форматирование сообщения эскалации для Telegram */
function formatEscalationMessage(report: EscalationReport): string {
  const actions = report.suggested_actions.map(a => `  □ ${a}`).join('\n');
  return `🚨 Agent Escalation — ${report.task_id}

Title: ${report.title}
Service: ${report.service}
Status: Failed after ${report.attempts.length} попыток

Last Error:
  ${report.last_error}

Cost So Far: $${report.cost_so_far_usd.toFixed(2)}

Action Required:
${actions}`;
}

// ─── Основная логика Coder агента ─────────────────────────────────────────────

export async function runCoder(taskFile: string, dryRun = false): Promise<boolean> {
  // 1. Читаем TaskSpec
  if (!fs.existsSync(taskFile)) {
    throw new Error(`TaskSpec файл не найден: ${taskFile}`);
  }
  const task: TaskSpec = JSON.parse(fs.readFileSync(taskFile, 'utf8'));
  console.error(`[coder] Запуск задачи: ${task.task_id} — ${task.title}`);

  // 2. Загружаем или создаём чекпойнт
  let state: CheckpointState = loadCheckpoint(task.task_id) ?? {
    task_id: task.task_id,
    status: 'in_progress',
    current_step: 'init',
    steps_completed: [],
    steps_remaining: ['lock', 'context', 'implement', 'eval', 'commit'],
    errors: [],
    retries: 0,
    tokens_used: { input: 0, output: 0, cost_usd: 0 },
    git_commits: [],
    eval_results: [],
    last_updated: new Date().toISOString(),
  };

  if (dryRun) {
    console.log(JSON.stringify({ dry_run: true, task_id: task.task_id, state }, null, 2));
    return true;
  }

  // 3. Захватываем блокировку сервиса
  console.error(`[coder] Захват блокировки: ${task.service}`);
  if (!acquireLock(task.service, task.task_id)) {
    console.error(`[coder] Сервис ${task.service} занят другим агентом`);
    return false;
  }

  auditLog(task.task_id, {
    agent_role: 'coder',
    action: 'lock_acquire',
    details: { service: task.service },
  });

  try {
    const attempts: EscalationAttempt[] = [];

    // 4. Цикл попыток (до max_retries)
    while (state.retries < (task.max_retries ?? CONFIG.maxRetries)) {
      state.current_step = `attempt_${state.retries + 1}`;
      state.last_updated = new Date().toISOString();
      saveCheckpoint(state);

      console.error(`\n[coder] Попытка ${state.retries + 1}/${task.max_retries}`);

      // 4a. Собираем контекст
      console.error('[coder] Сборка контекста...');
      const contextResult = runScript<{ success: boolean; context_file: string; total_tokens: number }>(
        'context-assemble.sh',
        ['--service', task.service, '--task-id', task.task_id, '--task-file', taskFile],
      );

      auditLog(task.task_id, {
        agent_role: 'coder',
        action: 'file_read',
        details: { context_file: contextResult.context_file, tokens: contextResult.total_tokens },
      });

      // 4b. Запускаем eval loop (проверяем текущее состояние кода)
      console.error('[coder] Запуск eval loop...');
      let evalResult: EvalLoopResult;
      try {
        evalResult = runEvalLoop(task.service, task.task_id);
      } catch (err) {
        evalResult = {
          task_id: task.task_id,
          service: task.service,
          passed: false,
          steps: [],
          total_duration_ms: 0,
          timestamp: new Date().toISOString(),
        };
      }

      state.eval_results.push(evalResult);
      auditLog(task.task_id, {
        agent_role: 'coder',
        action: 'eval_run',
        details: { passed: evalResult.passed, first_failure: evalResult.first_failure },
      });

      if (evalResult.passed) {
        // Eval прошёл — задача выполнена
        state.status = 'review';
        state.current_step = 'done';
        saveCheckpoint(state);
        console.error('[coder] ✅ Eval loop прошёл! Задача готова к review.');
        return true;
      }

      // 4c. Eval провалился — записываем попытку
      const firstFailure = evalResult.steps.find(s => !s.passed);
      const errorSummary = firstFailure?.errors[0]
        ? `${firstFailure.errors[0].file}:${firstFailure.errors[0].line} — ${firstFailure.errors[0].message}`
        : 'Неизвестная ошибка eval loop';

      console.error(`[coder] ❌ Eval провалился: ${errorSummary}`);

      attempts.push({
        attempt_number: state.retries + 1,
        error_summary: errorSummary,
        fix_tried: `Попытка ${state.retries + 1}: автоматическое исправление`,
        eval_result: evalResult,
      });

      state.errors = firstFailure?.errors ?? [];
      state.retries++;
      saveCheckpoint(state);
    }

    // 5. Исчерпаны все попытки — эскалация
    console.error(`[coder] 🚨 Исчерпаны все попытки (${task.max_retries}). Эскалация.`);
    state.status = 'escalated';
    saveCheckpoint(state);

    const escalation = createEscalationReport(task, attempts, state.tokens_used.cost_usd);

    auditLog(task.task_id, {
      agent_role: 'coder',
      action: 'escalation',
      details: { escalation_level: escalation.escalation_level, attempts: attempts.length },
    });

    // Выводим сообщение для Telegram
    console.log(formatEscalationMessage(escalation));
    return false;

  } finally {
    releaseLock(task.service, task.task_id);
    auditLog(task.task_id, {
      agent_role: 'coder',
      action: 'lock_release',
      details: { service: task.service },
    });
  }
}

// ─── CLI точка входа ──────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const taskFileIdx = args.indexOf('--task-file');
  const dryRun = args.includes('--dry-run');

  if (taskFileIdx === -1 || !args[taskFileIdx + 1]) {
    console.error('Использование: ts-node agents/coder.ts --task-file <path> [--dry-run]');
    process.exit(1);
  }

  const taskFile = args[taskFileIdx + 1];

  runCoder(taskFile, dryRun)
    .then(success => process.exit(success ? 0 : 1))
    .catch(err => {
      console.error('[coder] Критическая ошибка:', err.message);
      process.exit(1);
    });
}
