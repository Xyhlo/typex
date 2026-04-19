/**
 * Google Gemini adapter.
 *
 * `POST /v1beta/models/<model>:streamGenerateContent?alt=sse` with an
 * `x-goog-api-key` header returns SSE. Each event is `data: {...}\n\n`;
 * content lives under `candidates[0].content.parts[0].text`. There is no
 * [DONE] sentinel — the stream just closes when generation finishes.
 */
import type {
  AIProvider,
  AIProviderStatus,
  AIModel,
  AICompleteOpts,
  AIChunk,
} from '../provider';
import { getSecret, hasSecret } from '../secrets';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const SECRET_NAME = 'gemini-api-key';

/**
 * Fallback list, used when the vendor's model-list endpoint is unreachable
 * or the user hasn't pasted a key yet. Live list is fetched from
 * `/v1beta/models`.
 */
const FALLBACK_MODELS: AIModel[] = [
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', note: 'Safe default' },
];

export const geminiProvider: AIProvider = {
  id: 'gemini',
  label: 'Gemini API',
  vendor: 'google',
  kind: 'http-remote',

  async detect(): Promise<AIProviderStatus> {
    if (!(await hasSecret(SECRET_NAME))) {
      return { available: false, detail: 'API key not set' };
    }
    return { available: true };
  },

  async listModels(): Promise<AIModel[]> {
    const key = await getSecret(SECRET_NAME);
    if (!key) return FALLBACK_MODELS.slice();
    try {
      const res = await fetch(`${BASE}/models?pageSize=100`, {
        headers: { 'x-goog-api-key': key },
      });
      if (!res.ok) return FALLBACK_MODELS.slice();
      const data = (await res.json()) as {
        models?: Array<{
          name: string;
          displayName?: string;
          supportedGenerationMethods?: string[];
        }>;
      };
      const items = (data.models ?? [])
        .filter((m) =>
          (m.supportedGenerationMethods ?? []).includes('generateContent'),
        )
        .filter((m) => typeof m.name === 'string' && m.name.includes('gemini'))
        .map((m) => ({
          id: m.name.replace(/^models\//, ''),
          label: m.displayName || m.name.replace(/^models\//, ''),
        }));
      return items.length > 0 ? items : FALLBACK_MODELS.slice();
    } catch {
      return FALLBACK_MODELS.slice();
    }
  },

  async *complete(opts: AICompleteOpts): AsyncIterable<AIChunk> {
    const key = await getSecret(SECRET_NAME);
    if (!key) {
      yield {
        text: '',
        done: true,
        meta: { error: 'No Gemini API key configured.' },
      };
      return;
    }

    const userTurn: string[] = [];
    if (opts.context) userTurn.push(`Context:\n\n${opts.context}`);
    userTurn.push(opts.prompt);

    const body = JSON.stringify({
      contents: [
        { role: 'user', parts: [{ text: userTurn.join('\n\n') }] },
      ],
      systemInstruction: opts.system
        ? { parts: [{ text: opts.system }] }
        : undefined,
      generationConfig: {
        temperature: opts.temperature ?? 0.7,
        maxOutputTokens: opts.maxTokens ?? 1024,
      },
    });

    const url = `${BASE}/models/${encodeURIComponent(opts.model)}:streamGenerateContent?alt=sse`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key,
        },
        body,
        signal: opts.signal,
      });
    } catch (err) {
      yield {
        text: '',
        done: true,
        meta: { error: `Request failed: ${String(err).slice(0, 160)}` },
      };
      return;
    }

    if (!res.ok || !res.body) {
      const txt = await res.text().catch(() => '');
      yield {
        text: '',
        done: true,
        meta: { error: `Gemini returned HTTP ${res.status}: ${txt.slice(0, 200)}` },
      };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const dataLine = raw
            .split('\n')
            .find((l) => l.startsWith('data: '));
          if (!dataLine) continue;
          const jsonStr = dataLine.slice(6).trim();
          if (!jsonStr) continue;
          try {
            const evt = JSON.parse(jsonStr) as {
              candidates?: Array<{
                content?: { parts?: Array<{ text?: string }> };
                finishReason?: string;
              }>;
            };
            const parts = evt.candidates?.[0]?.content?.parts ?? [];
            for (const p of parts) {
              if (typeof p.text === 'string' && p.text.length > 0) {
                yield { text: p.text, done: false };
              }
            }
            if (evt.candidates?.[0]?.finishReason) {
              yield { text: '', done: true };
              return;
            }
          } catch {
            /* partial event — ignore */
          }
        }
      }
      yield { text: '', done: true };
    } catch (err) {
      if (opts.signal?.aborted) {
        yield { text: '', done: true, meta: { cancelled: true } };
        return;
      }
      yield {
        text: '',
        done: true,
        meta: { error: `Stream failed: ${String(err).slice(0, 160)}` },
      };
    } finally {
      try {
        reader.releaseLock();
      } catch {
        /* ignore */
      }
    }
  },
};
