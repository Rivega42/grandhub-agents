/**
 * agents/doc-writer.ts — Doc-Writer агент
 *
 * Автоматически генерирует/обновляет документацию после успешного
 * reviewer approve. Вызывается из orchestrator перед финализацией задачи.
 *
 * Использование:
 *   npx ts-node agents/doc-writer.ts --task-id <id> --service <name> --task-file <path>
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import * as https from 'https';
import * as http from 'http';
import type { TaskSpec } from '../types/task-spec';
import { createLogger } from './logger';

// ─── Конфигурация ─────────────────────────────────────────────────────────────

const CONFIG = {
  repoRoot:      process.env.GRANDHUB_ROOT ?? '/opt/grandhub-v3',
  model:         'anthropic/claude-sonnet-4-6',
  openrouterKey: process.env.OPENROUTER_API_KEY ?? '',
  maxDiffChars:  4000,
} as const;

// ─── CLI аргументы ────────────────────────────────────────────────────────────

function parseArgs(): { taskId: string; service: string; taskFile: string } {
  const args = process.argv.slice(2);
  const idx = (flag: string): number => args.indexOf(flag);

  const taskId   = args[idx('--task-id') + 1]   ?? '';
  const service  = args[idx('--service') + 1]    ?? '';
  const taskFile = args[idx('--task-file') + 1]  ?? '';

  if (!taskId || !service || !taskFile) {
    console.error('[doc-writer] Использование: --task-id <id> --service <name> --task-file <path>');
    process.exit(1);
  }

  return { taskId, service, taskFile };
}

// ─── LLM вызов (паттерн из coder.ts) ─────────────────────────────────────────

interface DocResult {
  changelog_entry: string;
  api_changes: string | null;
  readme_note: string | null;
}

async function callLLM(systemPrompt: string, userMessage: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: CONFIG.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage },
      ],
      max_tokens: 2000,
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
        'HTTP-Referer':  'https://grandhub.ru',
        'X-Title':       'GrandHub Doc-Writer Agent',
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer | string) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(json.error.message ?? JSON.stringify(json.error)));
            return;
          }
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

// ─── Парсинг JSON из LLM ─────────────────────────────────────────────────────

function parseDocResult(raw: string): DocResult | null {
  // Стратегия 1: блок ```json ... ```
  const jsonBlock = raw.match(/```json\s*([\s\S]*?)\s*```/s);
  if (jsonBlock) {
    try { return JSON.parse(jsonBlock[1]) as DocResult; } catch { /* fallthrough */ }
  }

  // Стратегия 2: { ... } от первой до последней скобки
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(raw.slice(firstBrace, lastBrace + 1)) as DocResult; } catch { /* fallthrough */ }
  }

  // Стратегия 3: весь ответ
  try { return JSON.parse(raw) as DocResult; } catch { /* fallthrough */ }

  return null;
}

// ─── Git diff ─────────────────────────────────────────────────────────────────

function getGitDiff(taskId: string): { diff: string; repoPath: string } {
  const worktreePath = path.join(CONFIG.repoRoot, 'worktrees', taskId);
  const repoPath = fs.existsSync(worktreePath) ? worktreePath : CONFIG.repoRoot;

  const result = spawnSync('git', [
    '-C', repoPath, 'diff', 'HEAD~1', 'HEAD',
    '--', '.', ':(exclude)*.test.ts', ':(exclude)*.spec.ts',
  ], { encoding: 'utf8', timeout: 15000 });

  const diff = (result.stdout ?? '').slice(0, CONFIG.maxDiffChars);
  return { diff, repoPath };
}

// ─── Применение документации ──────────────────────────────────────────────────

function applyChangelog(entry: string, repoPath: string): void {
  const changelogPath = path.join(repoPath, 'CHANGELOG.md');
  const header = '## [Unreleased]\n';

  if (fs.existsSync(changelogPath)) {
    let content = fs.readFileSync(changelogPath, 'utf8');
    if (content.includes('## [Unreleased]')) {
      content = content.replace(
        '## [Unreleased]\n',
        `## [Unreleased]\n${entry}\n`
      );
    } else {
      content = `# Changelog\n\n${header}${entry}\n\n${content}`;
    }
    fs.writeFileSync(changelogPath, content);
  } else {
    fs.writeFileSync(changelogPath, `# Changelog\n\n${header}${entry}\n`);
  }

  console.error(`[doc-writer] 📝 CHANGELOG.md обновлён`);
}

function applyApiChanges(service: string, apiChanges: string, repoPath: string): void {
  const docsDir = path.join(repoPath, 'docs', 'api');
  fs.mkdirSync(docsDir, { recursive: true });
  const apiFile = path.join(docsDir, `${service}.md`);

  const timestamp = new Date().toISOString().slice(0, 10);
  const section = `\n### ${timestamp}\n\n${apiChanges}\n`;

  if (fs.existsSync(apiFile)) {
    const existing = fs.readFileSync(apiFile, 'utf8');
    fs.writeFileSync(apiFile, existing + section);
  } else {
    fs.writeFileSync(apiFile, `# API Changes: ${service}\n${section}`);
  }

  console.error(`[doc-writer] 📝 docs/api/${service}.md обновлён`);
}

function commitDocs(service: string, repoPath: string): void {
  spawnSync('git', ['-C', repoPath, 'add', 'CHANGELOG.md', 'docs/'], {
    encoding: 'utf8', timeout: 10000,
  });

  const result = spawnSync('git', [
    '-C', repoPath, 'commit', '-m',
    `docs(${service}): auto-update via doc-writer [skip ci]`,
  ], { encoding: 'utf8', timeout: 10000 });

  if (result.status === 0) {
    const hash = result.stdout.match(/\[.+ ([a-f0-9]+)\]/)?.[1] ?? 'unknown';
    console.error(`[doc-writer] ✅ Документация закоммичена: ${hash}`);
  } else {
    console.error(`[doc-writer] ⚠️  Нечего коммитить (нет изменений)`);
  }
}

// ─── Главная функция ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { taskId, service, taskFile } = parseArgs();
  const log = createLogger(taskId);

  log.info('Doc-writer started', { service, taskFile });

  // 1. Читаем TaskSpec
  if (!fs.existsSync(taskFile)) {
    log.info(`Task file not found: ${taskFile} — skipping`);
    return;
  }
  const task: TaskSpec = JSON.parse(fs.readFileSync(taskFile, 'utf8'));

  // 2. Получаем git diff
  const { diff, repoPath } = getGitDiff(taskId);
  if (!diff.trim()) {
    log.info('No diff found — skipping doc generation');
    return;
  }

  // 3. Вызываем LLM
  log.info('Calling LLM for doc generation');
  const systemPrompt = 'Ты технический писатель. Анализируй git diff и генерируй краткую документацию изменений.';
  const userMessage = [
    `Сервис: ${service}. Задача: ${task.title}.`,
    `Diff:\n${diff}`,
    '',
    'Верни JSON:',
    '{',
    `  "changelog_entry": "- feat(${service}): <одна строка что добавлено>",`,
    '  "api_changes": "<если добавлены новые эндпоинты/команды — опиши их кратко, иначе null>",',
    '  "readme_note": "<если изменился публичный интерфейс — одно предложение, иначе null>"',
    '}',
  ].join('\n');

  const raw = await callLLM(systemPrompt, userMessage);
  const result = parseDocResult(raw);

  if (!result) {
    log.info('Failed to parse LLM response — skipping');
    console.error(`[doc-writer] ⚠️  Не удалось распарсить ответ LLM: ${raw.slice(0, 200)}`);
    return;
  }

  log.info('LLM response parsed', {
    changelog: result.changelog_entry,
    hasApiChanges: result.api_changes !== null,
    hasReadmeNote: result.readme_note !== null,
  });

  // 4. Применяем результат
  applyChangelog(result.changelog_entry, repoPath);

  if (result.api_changes) {
    applyApiChanges(service, result.api_changes, repoPath);
  }

  // 5. Коммитим
  commitDocs(service, repoPath);

  log.info('Doc-writer completed successfully');
  console.error(`[doc-writer] 🎉 Документация обновлена для ${service}`);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

if (require.main === module) {
  main().catch(err => {
    console.error(`[doc-writer] ❌ Fatal: ${err.message}`);
    process.exit(1);
  });
}
