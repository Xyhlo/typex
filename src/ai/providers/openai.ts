/**
 * OpenAI adapter — Chat Completions API with SSE streaming.
 *
 * `POST /v1/chat/completions` with `stream: true` returns SSE. Each event is
 * `data: {...}\n\n`; the final one is `data: [DONE]`. Content lives in
 * `choices[0].delta.content`.
 *
 * Base URL is overridable via localStorage (`typex:ai:openai-base`) so
 * OpenAI-compatible endpoints — OpenRouter, Together, Groq, local LiteLLM
 * proxies — can be pointed at without a code change.
 */
import type {
  AIProvider,
  AIProviderStatus,
  AIModel,
  AICompleteOpts,
  AIChunk,
} from '../provider';
import { getSecret, hasSecret } from '../secrets';

const DEFAULT_BASE = 'https://api.openai.com/v1';
const SECRET_NAME = 'openai-api-key';

/**
 * Fallback list, used when the vendor's model-list endpoint is unreachable
 * or the user hasn't pasted a key yet. Live list is fetched from `/v1/models`.
 */
const FALLBACK_MODELS: AIModel[] = [
  { id: 'gpt-4o', label: 'GPT-4o', note: 'Safe default' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', note: 'Cheap + fast' },
];

/** Patterns to exclude from the auto-filter — embeddings, audio, images, etc. */
const EXCLUDE_RX =
  /embed|whisper|tts|audio|dall-e|image|realtime|moderation|guard|codex-mini/i;
/** Patterns we include — broad enough to catch future text models. */
const INCLUDE_RX = /^(gpt-|o1|o3|o4|chatgpt-)/i;

const getBase = (): string => {
  try {
    const override = localStorage.getItem('typex:ai:openai-base');
    if (override && override.trim().length > 0) return override.trim();
  } catch {
    /* ignore */
  }
  return DEFAULT_BASE;
};

export const openaiProvider: AIProvider = {
  id: 'openai',
  label: 'OpenAI API',
  vendor: 'openai',
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
      const res = await fetch(`${getBase()}/models`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) return FALLBACK_MODELS.slice();
      const data = (await res.json()) as {
        data?: Array<{ id: string; owned_by?: string }>;
      };
      const items = (data.data ?? [])
        .filter((m) => typeof m.id === 'string')
        .filter((m) => INCLUDE_RX.test(m.id))
        .filter((m) => !EXCLUDE_RX.test(m.id))
        .map((m) => ({ id: m.id, label: m.id }))
        .sort((a, b) => a.id.localeCompare(b.id));
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
        meta: { error: 'No OpenAI API key configured.' },
      };
      return;
    }

    const messages: Array<{ role: string; content: string }> = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    if (opts.context) {
      messages.push({ role: 'user', content: `Context:\n\n${opts.context}` });
    }
    messages.push({ role: 'user', content: opts.prompt });

    const body = JSON.stringify({
      model: opts.model,
      stream: true,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 1024,
      messages,
    });

    let res: Response;
    try {
      res = await fetch(`${getBase()}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
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
        meta: { error: `OpenAI returned HTTP ${res.status}: ${txt.slice(0, 200)}` },
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
          if (jsonStr === '[DONE]') {
            yield { text: '', done: true };
            return;
          }
          try {
            const evt = JSON.parse(jsonStr) as {
              choices?: Array<{
                delta?: { content?: string };
                finish_reason?: string | null;
              }>;
            };
            const delta = evt.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta.length > 0) {
              yield { text: delta, done: false };
            }
            if (evt.choices?.[0]?.finish_reason) {
              yield { text: '', done: true };
              return;
            }
          } catch {
            /* partial or non-delta event — ignore */
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
