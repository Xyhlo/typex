/**
 * Ollama adapter — local HTTP API at 127.0.0.1:11434.
 *
 * `GET /api/tags` returns installed models. `POST /api/generate` streams
 * NDJSON with `{ response: "...", done: bool }` per line.
 *
 * No auth, no config — if the daemon is running, we work.
 */
import type {
  AIProvider,
  AIProviderStatus,
  AIModel,
  AICompleteOpts,
  AIChunk,
} from '../provider';

const DEFAULT_BASE = 'http://127.0.0.1:11434';

const getBase = (): string => {
  try {
    const override = localStorage.getItem('typex:ai:ollama-base');
    if (override && override.trim().length > 0) return override.trim();
  } catch {
    /* ignore */
  }
  return DEFAULT_BASE;
};

export const ollamaProvider: AIProvider = {
  id: 'ollama',
  label: 'Ollama',
  vendor: 'ollama',
  kind: 'http-local',

  async detect(): Promise<AIProviderStatus> {
    const base = getBase();
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1500);
      const res = await fetch(`${base}/api/tags`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) {
        return { available: false, detail: `HTTP ${res.status}` };
      }
      const data = (await res.json()) as { models?: Array<{ name: string }> };
      return { available: true, modelCount: data.models?.length ?? 0 };
    } catch (err) {
      const msg = String(err);
      if (msg.includes('AbortError') || msg.includes('aborted')) {
        return { available: false, detail: 'Ollama daemon not responding on 11434' };
      }
      return { available: false, detail: 'Ollama daemon not running' };
    }
  },

  async listModels(): Promise<AIModel[]> {
    try {
      const res = await fetch(`${getBase()}/api/tags`);
      if (!res.ok) return [];
      const data = (await res.json()) as {
        models?: Array<{
          name: string;
          details?: { parameter_size?: string; family?: string };
        }>;
      };
      return (data.models ?? []).map((m) => ({
        id: m.name,
        label: m.name,
        note:
          m.details?.parameter_size || m.details?.family
            ? [m.details?.family, m.details?.parameter_size]
                .filter(Boolean)
                .join(' · ')
            : undefined,
      }));
    } catch {
      return [];
    }
  },

  async *complete(opts: AICompleteOpts): AsyncIterable<AIChunk> {
    const body = JSON.stringify({
      model: opts.model,
      prompt:
        (opts.system ? opts.system + '\n\n' : '') +
        (opts.context ? opts.context + '\n\n' : '') +
        opts.prompt,
      stream: true,
      options: {
        temperature: opts.temperature ?? 0.7,
        num_predict: opts.maxTokens ?? 1024,
      },
    });
    const res = await fetch(`${getBase()}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: opts.signal,
    });
    if (!res.ok || !res.body) {
      yield {
        text: '',
        done: true,
        meta: { error: `Ollama returned HTTP ${res.status}` },
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
        // Ollama emits one JSON object per line.
        let idx: number;
        while ((idx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line) continue;
          try {
            const chunk = JSON.parse(line) as {
              response?: string;
              done?: boolean;
            };
            if (chunk.response) yield { text: chunk.response, done: false };
            if (chunk.done) {
              yield { text: '', done: true };
              return;
            }
          } catch {
            /* ignore unparseable — likely partial */
          }
        }
      }
      // Flush any final buffered fragment.
      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer) as { response?: string };
          if (chunk.response) yield { text: chunk.response, done: false };
        } catch {
          /* ignore */
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
        meta: { error: `Ollama stream failed: ${String(err).slice(0, 160)}` },
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
