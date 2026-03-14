/**
 * agents/tester.ts — Tester агент
 *
 * Запускает тесты сервиса, при провале анализирует ошибки через LLM.
 * Результат сохраняется в .agent-state/<task-id>-tester.json
 *
 * Использование:
 *   npx ts-node agents/tester.ts --task-id <id> --service-path <path>
 *
 * Exit code 0 = тесты прошли, 1 = тесты упали
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

// ─── Типы ────────────────────────────────────────────────────────────────────

interface TesterResult {
  task_id: string;
  passed: boolean;
  test_output: string;
  llm_analysis?: {
    root_cause: string;
    fix_hints: string[];
  };
  timestamp: string;
}

// ─── Конфигурация ────────────────────────────────────────────────────────────

const STATE_DIR = path.resolve(__dirname, '../.agent-state');
const LLM_URL = 'http://localhost:18789/v1/chat/completions';
const LLM_MODEL = 'anthropic/claude-opus-4-6';
const TEST_TIMEOUT = 120_000;

// ─── Парсинг аргументов ──────────────────────────────────────────────────────

function parseArgs(): { taskId: string; servicePath: string } {
  const args = process.argv.slice(2);
  let taskId = '';
  let servicePath = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--task-id' && args[i + 1]) {
      taskId = args[i + 1];
      i++;
    } else if (args[i] === '--service-path' && args[i + 1]) {
      servicePath = args[i + 1];
      i++;
    }
  }

  if (!taskId || !servicePath) {
    console.error('Usage: npx ts-node agents/tester.ts --task-id <id> --service-path <path>');
    process.exit(1);
  }

  return { taskId, servicePath };
}

// ─── Запуск тестов ───────────────────────────────────────────────────────────

function runTests(servicePath: string): { passed: boolean; output: string } {
  const testScript = path.join(servicePath, 'scripts', 'test.sh');

  if (!fs.existsSync(testScript)) {
    console.error(`[tester] ⚠️  test.sh не найден: ${testScript}, считаем OK`);
    return { passed: true, output: 'No test script found — skipped' };
  }

  try {
    const output = execSync(`bash "${testScript}"`, {
      cwd: servicePath,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: TEST_TIMEOUT,
    });
    return { passed: true, output: output ?? '' };
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string; message?: string };
    const output = [
      execError.stdout ?? '',
      execError.stderr ?? '',
      execError.message ?? '',
    ].join('\n');
    return { passed: false, output };
  }
}

// ─── LLM анализ провалов (node stdlib http) ─────────────────────────────────

function callLLM(testOutput: string): Promise<{ root_cause: string; fix_hints: string[] }> {
  return new Promise((resolve, reject) => {
    const truncated = testOutput.slice(0, 3000);

    const body = JSON.stringify({
      model: LLM_MODEL,
      messages: [
        {
          role: 'system',
          content: `Ты — QA-инженер. Анализируй провал тестов и верни СТРОГО JSON (без markdown):
{"root_cause": "краткое описание причины", "fix_hints": ["подсказка 1", "подсказка 2"]}`,
        },
        {
          role: 'user',
          content: `Тесты упали. Вот вывод (первые 3000 символов):\n\n${truncated}`,
        },
      ],
      max_tokens: 2000,
      temperature: 0.2,
    });

    const parsed = new URL(LLM_URL);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port ? parseInt(parsed.port) : 80,
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY ?? ''}`,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.error) {
              console.error(`[tester] LLM error: ${JSON.stringify(json.error)}`);
              resolve({ root_cause: 'LLM returned error', fix_hints: [] });
              return;
            }
            const content: string = json.choices?.[0]?.message?.content ?? '';
            // Пытаемся извлечь JSON из ответа
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              resolve({
                root_cause: parsed.root_cause ?? 'unknown',
                fix_hints: Array.isArray(parsed.fix_hints) ? parsed.fix_hints : [],
              });
            } else {
              resolve({ root_cause: content.slice(0, 500), fix_hints: [] });
            }
          } catch (e) {
            console.error(`[tester] LLM parse error: ${(e as Error).message}`);
            resolve({ root_cause: 'Failed to parse LLM response', fix_hints: [] });
          }
        });
      }
    );

    req.on('error', (e) => {
      console.error(`[tester] LLM request error: ${e.message}`);
      resolve({ root_cause: 'LLM request failed', fix_hints: [] });
    });

    req.setTimeout(60_000, () => {
      req.destroy();
      resolve({ root_cause: 'LLM request timeout', fix_hints: [] });
    });

    req.write(body);
    req.end();
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { taskId, servicePath } = parseArgs();

  console.error(`[tester] 🧪 Task: ${taskId}`);
  console.error(`[tester] 📁 Service: ${servicePath}`);

  const { passed, output } = runTests(servicePath);

  const result: TesterResult = {
    task_id: taskId,
    passed,
    test_output: output.slice(0, 5000),
    timestamp: new Date().toISOString(),
  };

  if (passed) {
    console.error(`[tester] ✅ Тесты прошли`);
  } else {
    console.error(`[tester] ❌ Тесты упали, анализирую через LLM...`);
    result.llm_analysis = await callLLM(output);
    console.error(`[tester] 🔍 Root cause: ${result.llm_analysis.root_cause}`);
    if (result.llm_analysis.fix_hints.length > 0) {
      console.error(`[tester] 💡 Fix hints: ${result.llm_analysis.fix_hints.join('; ')}`);
    }
  }

  // Сохраняем результат
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const resultFile = path.join(STATE_DIR, `${taskId}-tester.json`);
  fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
  console.error(`[tester] 📝 Результат: ${resultFile}`);

  // Выводим JSON на stdout для orchestrator
  console.log(JSON.stringify(result, null, 2));

  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error(`[tester] FATAL: ${(err as Error).message}`);
  process.exit(1);
});
