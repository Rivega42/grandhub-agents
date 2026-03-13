/**
 * task-spec.ts — TypeScript типы для системы GrandHub Agents
 * Описывает все структуры данных: TaskSpec, CheckpointState, EvalResult, EscalationReport
 * Следует архитектуре из docs/autonomous-agents-architecture.md (секции 3, 5, 6, 7)
 */

// ─── TaskSpec ────────────────────────────────────────────────────────────────

export type TaskType = 'feature' | 'bugfix' | 'refactor' | 'chore' | 'security';

export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'review'
  | 'testing'
  | 'deploying'
  | 'done'
  | 'failed'
  | 'escalated';

export type AgentRole =
  | 'orchestrator'
  | 'coder'
  | 'reviewer'
  | 'tester'
  | 'deployer'
  | 'architect';

export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export type TaskComplexity = 'trivial' | 'simple' | 'medium' | 'complex' | 'epic';

/**
 * Основной документ задачи — единственный источник истины о том что нужно сделать.
 * Все агенты работают только с TaskSpec, никакого неструктурированного текста.
 */
export interface TaskSpec {
  /** Уникальный ID задачи: TASK-YYYY-MMDD-NNN */
  task_id: string;

  /** Короткое название задачи (до 80 символов) */
  title: string;

  /** Подробное описание что нужно сделать и почему */
  description: string;

  /** Приоритет задачи */
  priority: TaskPriority;

  /** Тип задачи */
  type: TaskType;

  /**
   * Критерии приёмки — конкретные, проверяемые условия.
   * Каждый пункт должен быть автоматически верифицирован.
   */
  acceptance_criteria: string[];

  /**
   * Список файлов в пределах одного сервиса.
   * Coder работает ТОЛЬКО с этими файлами.
   */
  file_scope: string[];

  /** ID задач которые должны быть выполнены до начала этой */
  dependencies: string[];

  /** ID задач которые блокируют эту */
  blocked_by: string[];

  /** Название сервиса (должно совпадать с ключом в service-graph.json) */
  service: string;

  /** Оценка сложности */
  estimated_complexity: TaskComplexity;

  /** Максимальное время выполнения в минутах */
  timeout_minutes: number;

  /** Максимальное количество попыток перед эскалацией */
  max_retries: number;

  /** Количество последовательных провалов до эскалации */
  escalation_threshold: number;

  /** Лимит бюджета на API вызовы в USD */
  cost_budget_usd: number;

  /** Когда задача была создана (ISO 8601) */
  created_at: string;

  /** Кто создал задачу */
  created_by: 'orchestrator' | 'human';

  /** Текущий статус */
  status: TaskStatus;

  /** Какой агент сейчас работает над задачей */
  assigned_to: AgentRole | null;

  /** Название git ветки для этой задачи: agent/<task_id> */
  worktree_branch: string;

  /** Путь к файлу чекпойнта */
  checkpoint_file: string;
}

// ─── Checkpoint & State ──────────────────────────────────────────────────────

export interface CompletedStep {
  step: string;
  timestamp: string;
  duration_ms: number;
  files_read?: string[];
  files_written?: string[];
  eval_passed?: boolean;
}

export interface TokenUsage {
  input: number;
  output: number;
  cost_usd: number;
}

/**
 * Состояние агента сохраняемое в .agent-state/<task_id>.json
 * Позволяет возобновить выполнение после краша или таймаута
 */
export interface CheckpointState {
  task_id: string;
  status: TaskStatus;
  current_step: string;
  steps_completed: CompletedStep[];
  steps_remaining: string[];
  errors: EvalError[];
  retries: number;
  tokens_used: TokenUsage;
  git_commits: string[];
  eval_results: EvalResult[];
  last_updated: string;
}

// ─── Eval Loop ───────────────────────────────────────────────────────────────

export type EvalStep = 'lint' | 'typecheck' | 'test' | 'build';

export interface EvalError {
  file: string;
  line?: number;
  column?: number;
  message: string;
  code?: string;
  severity?: 'error' | 'warning';
}

/**
 * Результат одного шага eval loop.
 * Вывод скриптов lint.sh / typecheck.sh / test.sh / build.sh
 */
export interface EvalResult {
  step: EvalStep;
  passed: boolean;
  duration_ms: number;
  errors: EvalError[];
  warnings?: EvalError[];
  timestamp: string;
  service?: string;
  task_id?: string;
}

/**
 * Результат полного прогона eval-loop.sh
 */
export interface EvalLoopResult {
  task_id: string;
  service: string;
  passed: boolean;
  steps: EvalResult[];
  total_duration_ms: number;
  first_failure?: EvalStep;
  timestamp: string;
}

// ─── Escalation ──────────────────────────────────────────────────────────────

export type EscalationLevel = 'orchestrator' | 'architect' | 'human';

export interface EscalationAttempt {
  attempt_number: number;
  error_summary: string;
  fix_tried: string;
  eval_result: EvalLoopResult;
}

/**
 * Отчёт об эскалации — отправляется в Telegram при достижении порога ошибок.
 * Содержит полный контекст для человека чтобы принять решение.
 */
export interface EscalationReport {
  task_id: string;
  title: string;
  service: string;
  escalation_level: EscalationLevel;
  attempts: EscalationAttempt[];
  last_error: string;
  cost_so_far_usd: number;
  architect_analysis?: string;
  suggested_actions: ('fix_manually' | 'provide_guidance' | 'defer' | 'cancel')[];
  created_at: string;
}

// ─── Agent Audit Log ─────────────────────────────────────────────────────────

export type AuditAction =
  | 'file_read'
  | 'file_write'
  | 'eval_run'
  | 'git_commit'
  | 'lock_acquire'
  | 'lock_release'
  | 'escalation'
  | 'checkpoint_save'
  | 'api_call';

/**
 * Запись в audit log — каждое действие агента.
 * Хранится в .agent-logs/<task_id>.jsonl
 */
export interface AuditLogEntry {
  timestamp: string;
  task_id: string;
  agent_role: AgentRole;
  action: AuditAction;
  details: Record<string, unknown>;
  tokens?: TokenUsage;
  cost_usd?: number;
  duration_ms?: number;
}
