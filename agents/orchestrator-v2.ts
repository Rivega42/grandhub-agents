// orchestrator-v2.ts — LLM Orchestrator: принимает фичу, декомпозирует, запускает coder per SubTask
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { planFeature, SubTask } from './llm-planner';

const GHA_ROOT = path.dirname(__dirname) || '/opt/grandhub-agents';
const STATE_DIR = path.join(GHA_ROOT, '.agent-state', 'v2');

interface OrchestratorState {
  feature_id: string;
  title: string;
  service: string;
  github_issue?: number;
  subtasks: Array<{ subtask: SubTask; status: 'pending' | 'done' | 'failed' }>;
  started_at: string;
  finished_at?: string;
}

function ensureDir(d: string) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function runCoder(taskFile: string): boolean {
  const result = spawnSync(
    'npx',
    ['ts-node', path.join(GHA_ROOT, 'agents', 'coder.ts'), '--task-file', taskFile],
    { cwd: GHA_ROOT, timeout: 300_000, encoding: 'utf8', env: process.env },
  );
  if (result.error) {
    console.error('[orchestrator-v2] coder spawn error:', result.error.message);
    return false;
  }
  if (result.status !== 0) {
    console.error('[orchestrator-v2] coder exited', result.status, result.stderr?.slice(0, 500));
    return false;
  }
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  if (args.includes('--help') || args.length === 0) {
    console.log(`Usage: ts-node agents/orchestrator-v2.ts --title "..." --service "..." [--description "..."] [--github-issue 42]`);
    process.exit(0);
  }

  const title       = get('--title')        ?? 'Unnamed feature';
  const service     = get('--service')      ?? 'telegram-bot';
  const description = get('--description') ?? title;
  const ghIssue     = get('--github-issue') ? parseInt(get('--github-issue')!, 10) : undefined;

  const featureId = `feature-${Date.now()}`;
  ensureDir(STATE_DIR);

  console.error(`[orchestrator-v2] Планирую фичу: ${title} [service=${service}]`);

  const subtasks = await planFeature(title, description, service);
  console.error(`[orchestrator-v2] Декомпозиция: ${subtasks.length} SubTask(s)`);
  subtasks.forEach((s, i) => console.error(`  ${i + 1}. ${s.title}`));

  const state: OrchestratorState = {
    feature_id: featureId,
    title,
    service,
    github_issue: ghIssue,
    subtasks: subtasks.map(s => ({ subtask: s, status: 'pending' })),
    started_at: new Date().toISOString(),
  };

  const stateFile = path.join(STATE_DIR, `${featureId}.json`);
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));

  for (let i = 0; i < subtasks.length; i++) {
    const st = subtasks[i];
    console.error(`[orchestrator-v2] SubTask ${i + 1}/${subtasks.length}: ${st.title}`);

    const specFile = path.join(STATE_DIR, `${featureId}-st${i + 1}.json`);
    const spec = {
      task_id: `${featureId}-st${i + 1}`,
      title: st.title,
      description: st.description,
      service: st.service,
      type: 'feature',
      file_scope: st.file_scope,
      allow_test_failure: true,
      created_at: new Date().toISOString(),
    };
    fs.writeFileSync(specFile, JSON.stringify(spec, null, 2));

    const ok = runCoder(specFile);
    state.subtasks[i].status = ok ? 'done' : 'failed';
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));

    console.error(`[orchestrator-v2] SubTask ${i + 1} → ${ok ? 'done ✅' : 'failed ❌'}`);
  }

  state.finished_at = new Date().toISOString();
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));

  const done   = state.subtasks.filter(s => s.status === 'done').length;
  const failed = state.subtasks.filter(s => s.status === 'failed').length;
  console.log(`[orchestrator-v2] Готово: ${done}/${subtasks.length} успешно, ${failed} упало`);
  console.log(`[orchestrator-v2] State: ${stateFile}`);
}

main().catch(err => { console.error('[orchestrator-v2] FATAL:', err.message); process.exit(1); });
