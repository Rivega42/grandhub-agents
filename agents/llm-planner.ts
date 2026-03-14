// llm-planner.ts — LLM клиент и декомпозиция фич на SubTask[]
import * as http  from 'http';
import * as https from 'https';
import * as url   from 'url';

export interface SubTask {
  id: string;
  title: string;
  description: string;
  service: string;
  file_scope: string[];
}

interface Message { role: string; content: string; }

export async function callLLM(messages: Message[]): Promise<string> {
  const baseUrl = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';
  const apiKey  = process.env.OPENROUTER_API_KEY  ?? '';
  const endpoint = `${baseUrl}/chat/completions`;

  const body = JSON.stringify({
    model: 'anthropic/claude-opus-4-6',
    messages,
    max_tokens: 2000,
  });

  return new Promise((resolve, reject) => {
    const parsed  = new url.URL(endpoint);
    const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    const requester = isLocal ? http : https;

    const req = requester.request(
      { hostname: parsed.hostname, port: Number(parsed.port) || (isLocal ? 80 : 443),
        path: parsed.pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`,
                   'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk; });
        res.on('end', () => {
          if (!res.statusCode || res.statusCode >= 400) {
            return reject(new Error(`LLM HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          }
          try {
            const json = JSON.parse(data);
            resolve(json.choices?.[0]?.message?.content ?? '');
          } catch (e) { reject(new Error(`LLM parse error: ${data.slice(0, 200)}`)); }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

export async function planFeature(
  title: string,
  description: string,
  service: string,
): Promise<SubTask[]> {
  const systemPrompt = [
    'Ты архитектор. Декомпозируй задачу на 2-4 SubTask.',
    'Каждый SubTask = изменение 1-3 файлов. Отвечай ТОЛЬКО JSON массивом без markdown.',
    `Формат: [{"id":"st-1","title":"...","description":"...","service":"${service}","file_scope":["path/file.ts"]}]`,
  ].join('\n');

  try {
    const raw = await callLLM([
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: `Задача: ${title}\n\n${description}` },
    ]);
    const match = raw.match(/\[[\s\S]*\]/);
    const parsed: SubTask[] = JSON.parse(match ? match[0] : raw);
    return parsed.length > 0 ? parsed : fallback(title, description, service);
  } catch {
    console.error('[llm-planner] Не удалось распарсить SubTask — fallback');
    return fallback(title, description, service);
  }
}

function fallback(title: string, description: string, service: string): SubTask[] {
  return [{ id: 'st-1', title, description, service, file_scope: [] }];
}
