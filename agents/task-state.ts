/**
 * agents/task-state.ts — FSM состояния задачи с персистентностью
 * Позволяет восстанавливать задачи после краша/перезапуска сервиса
 */
import * as fs from 'fs';
import * as path from 'path';

export type TaskPhase =
  | 'queued' | 'worktree_setup' | 'context' | 'coding'
  | 'eval_lint' | 'eval_typecheck' | 'eval_test'
  | 'committing' | 'reviewing' | 'pr_creating'
  | 'completed' | 'failed' | 'escalated';

export interface TaskState {
  taskId: string;
  issueNumber?: number;
  phase: TaskPhase;
  attempt: number;
  worktreePath: string;
  startedAt: string;
  updatedAt: string;
  lastError?: string;
  prUrl?: string;
  reviewScore?: number;
}

const STATE_DIR = '/opt/grandhub-agents/.agent-state/tasks';
const TERMINAL_PHASES: TaskPhase[] = ['completed', 'failed', 'escalated'];

export function saveTaskState(state: TaskState): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(STATE_DIR, `${state.taskId}.json`),
    JSON.stringify(state, null, 2)
  );
}

export function loadTaskState(taskId: string): TaskState | null {
  const file = path.join(STATE_DIR, `${taskId}.json`);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as TaskState; }
  catch { return null; }
}

export function loadIncompleteStates(): TaskState[] {
  if (!fs.existsSync(STATE_DIR)) return [];
  return fs.readdirSync(STATE_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(STATE_DIR, f), 'utf8')) as TaskState; }
      catch { return null; }
    })
    .filter((s): s is TaskState => s !== null && !TERMINAL_PHASES.includes(s.phase));
}

export function transitionPhase(
  taskId: string,
  phase: TaskPhase,
  extra?: Partial<TaskState>
): TaskState {
  const existing = loadTaskState(taskId);
  const state: TaskState = existing ?? {
    taskId,
    phase: 'queued',
    attempt: 1,
    worktreePath: '',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state.phase = phase;
  if (extra) Object.assign(state, extra);
  saveTaskState(state);
  return state;
}
