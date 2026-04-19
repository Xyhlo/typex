/**
 * Anthropic direct-API adapter.
 *
 * `POST /v1/messages` with `x-api-key` header, `anthropic-version` header,
 * `stream: true` body. Server-sent-events stream back; `content_block_delta`
 * events carry text.
 *
 * Model list is hardcoded — Anthropic doesn't publish an enumeration
 * endpoint we can call without auth, and the set changes rarely enough
 * that "update the list with each TypeX release" is acceptable.
 */
import type {
  AIProvider,
  AIProviderStatus,
  AIModel,
  AICompleteOpts,
  AIChunk,
} from '../provider';
import { getSecret, hasSecret } from '../secrets';

const BASE = 'https://api.anthropic.com/v1';
const API_VERSION = '2023-06-01';
const SECRET_NAME = 'anthropic-api-key';

/**
 * Fallback list, used when the vendor's model-list endpoint is unreachable
 * or the user hasn't pasted a key yet. The live list is fetched dynamically
 * from `/v1/models` in `listModels()`.
 */
const FALLBACK_MODELS: AIModel[] = [
  { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', note: 'Most capable · slower' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', note: 'Balanced default' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', note: 'Fastest' },
];

export const anthropicProvider: AIProvider = {
  id: 'anthropic',
  label: 'Anthropic API',
  vendor: 'anthropic',
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
      const res = await fetch(`${BASE}/models`, {
        headers: {
          'x-api-key': key,
          'anthropic-version': API_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      });
      if (!res.ok) return FALLBACK_MODELS.slice();
      const data = (await res.json()) as {
        data?: Array<{ id: string; display_name?: string; created_at?: string }>;
      };
      const items = (data.data ?? [])
        .filter((m) => typeof m.id === 'string' && m.id.startsWith('claude-'))
        .map((m) => ({
          id: m.id,
          label: m.display_name || m.id,
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
        meta: { error: 'No Anthropic API key configured.' },
      };
      return;
    }

    const messages = [{ role: 'user', content: opts.prompt }];
    if (opts.context) {
      messages.unshift({
        role: 'user',
        content: `Context:\n\n${opts.context}`,
      });
    }
    const body = JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.7,
      system: opts.system ?? undefined,
      stream: true,
      messages,
    });

    let res: Response;
    try {
      res = await fetch(`${BASE}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': API_VERSION,
          // Tauri WebView doesn't enforce CORS on this, but browsers will —
          // that's OK for the desktop build.
          'anthropic-dangerous-direct-browser-access': 'true',
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
        meta: { error: `Anthropic returned HTTP ${res.status}: ${txt.slice(0, 200)}` },
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
        // SSE events separated by blank lines.
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          // Each event has `event: ...` and `data: {...}` lines.
          const dataLine = raw
            .split('\n')
            .find((l) => l.startsWith('data: '));
          if (!dataLine) continue;
          const jsonStr = dataLine.slice(6).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;
          try {
            const evt = JSON.parse(jsonStr) as {
              type?: string;
              delta?: { type?: string; text?: string };
              message?: unknown;
            };
            if (
              evt.type === 'content_block_delta' &&
              evt.delta?.type === 'text_delta' &&
              typeof evt.delta.text === 'string'
            ) {
              yield { text: evt.delta.text, done: false };
            }
            if (evt.type === 'message_stop') {
              yield { text: '', done: true };
              return;
            }
          } catch {
            /* ignore parse errors — partial events */
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
