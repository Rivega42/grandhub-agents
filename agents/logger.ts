/**
 * agents/logger.ts — Structured JSON logger с correlation ID (taskId)
 */
import * as fs from 'fs';
import * as path from 'path';

const LOG_DIR = '/opt/grandhub-agents/.agent-logs';

export function createLogger(taskId: string) {
  const write = (level: string, msg: string, data?: Record<string, unknown>): void => {
    const entry = { ts: new Date().toISOString(), level, taskId, msg, ...data };
    const line = JSON.stringify(entry) + '\n';
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(path.join(LOG_DIR, `${taskId}.jsonl`), line);
    fs.appendFileSync(path.join(LOG_DIR, 'combined.jsonl'), line);
    process.stderr.write(`[${level.toUpperCase()}] [${taskId}] ${msg}\n`);
  };

  return {
    info:  (msg: string, data?: Record<string, unknown>): void => write('info', msg, data),
    warn:  (msg: string, data?: Record<string, unknown>): void => write('warn', msg, data),
    error: (msg: string, data?: Record<string, unknown>): void => write('error', msg, data),
    phase: (name: string): (() => void) => {
      const start = Date.now();
      write('info', `Phase started: ${name}`);
      return (): void => write('info', `Phase done: ${name}`, { durationMs: Date.now() - start });
    },
  };
}
