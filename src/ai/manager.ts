/**
 * AI manager — the single entry point the UI calls.
 *
 *   - Registers providers
 *   - Keeps a cached detection state per provider (refreshable)
 *   - Persists the user's chosen provider + model in prefs
 *   - Dispatches `complete()` calls to the right adapter
 *   - Emits a lightweight "in-flight" signal so the status-bar indicator
 *     can pulse while any request is open
 */

import type {
  AIProvider,
  AIProviderStatus,
  AIModel,
  AICompleteOpts,
  AIChunk,
} from './provider';
import { ollamaProvider } from './providers/ollama';
import { anthropicProvider } from './providers/anthropic';
import { openaiProvider } from './providers/openai';
import { geminiProvider } from './providers/gemini';
import { claudeCodeProvider } from './providers/claude-code';
import { codexProvider } from './providers/codex';
import { geminiCliProvider } from './providers/gemini-cli';
import { loadPrefs, savePrefs } from '../session';

/**
 * Order matters — it's the order rows render in Preferences. Group APIs first
 * (most users' starting point), then local, then CLIs.
 */
const providers: AIProvider[] = [
  ollamaProvider,
  anthropicProvider,
  openaiProvider,
  geminiProvider,
  claudeCodeProvider,
  codexProvider,
  geminiCliProvider,
];

interface DetectionState {
  status: AIProviderStatus;
  models: AIModel[];
  lastDetected: number;
}

const detection = new Map<string, DetectionState>();

export const listProviders = (): AIProvider[] => providers.slice();

export const getProvider = (id: string): AIProvider | null =>
  providers.find((p) => p.id === id) ?? null;

export const getDetection = (id: string): DetectionState | null =>
  detection.get(id) ?? null;

/** Run detect + listModels for a single provider and cache. */
export const refreshProvider = async (id: string): Promise<DetectionState> => {
  const p = getProvider(id);
  if (!p) throw new Error(`Unknown provider: ${id}`);
  const status = await p.detect();
  const models = status.available ? await p.listModels() : [];
  const state: DetectionState = {
    status: { ...status, modelCount: models.length },
    models,
    lastDetected: Date.now(),
  };
  detection.set(id, state);
  notifyListeners();
  return state;
};

/** Refresh everything — called on settings-open + after key changes. */
export const refreshAll = async (): Promise<void> => {
  await Promise.all(providers.map((p) => refreshProvider(p.id).catch(() => null)));
};

/* ─────────────────────────────────────────────────────────────
   Current selection (provider + model)
   ───────────────────────────────────────────────────────────── */

export interface ActiveSelection {
  providerId: string;
  modelId: string;
}

export const getActive = (): ActiveSelection | null => {
  const p = loadPrefs();
  if (!p.aiProvider || !p.aiModel) return null;
  return { providerId: p.aiProvider, modelId: p.aiModel };
};

export const setActive = (sel: ActiveSelection | null): void => {
  const p = loadPrefs();
  p.aiProvider = sel?.providerId ?? '';
  p.aiModel = sel?.modelId ?? '';
  savePrefs(p);
  notifyListeners();
};

/* ─────────────────────────────────────────────────────────────
   In-flight indicator + listeners
   ───────────────────────────────────────────────────────────── */

type InFlight = {
  id: number;
  providerId: string;
  modelId: string;
  startedAt: number;
  abort: () => void;
};

let nextId = 1;
const inFlight = new Map<number, InFlight>();
type Listener = () => void;
const listeners = new Set<Listener>();

export const subscribeAI = (fn: Listener): (() => void) => {
  listeners.add(fn);
  fn();
  return () => {
    listeners.delete(fn);
  };
};

const notifyListeners = (): void => {
  for (const fn of listeners) {
    try {
      fn();
    } catch (err) {
      console.error('[ai] listener threw:', err);
    }
  }
};

export const getInFlight = (): InFlight[] => Array.from(inFlight.values());
export const hasInFlight = (): boolean => inFlight.size > 0;

/* ─────────────────────────────────────────────────────────────
   complete() — the one call the UI uses
   ───────────────────────────────────────────────────────────── */

/**
 * Stream a completion using the currently-active provider + model (or an
 * explicit override). Returns an async iterable of chunks; caller drives
 * rendering.
 */
export async function* complete(
  opts: Omit<AICompleteOpts, 'model'> & {
    provider?: string;
    model?: string;
  },
): AsyncIterable<AIChunk> {
  const active = getActive();
  const providerId = opts.provider ?? active?.providerId;
  const modelId = opts.model ?? active?.modelId;
  if (!providerId || !modelId) {
    yield {
      text: '',
      done: true,
      meta: { error: 'No AI provider or model selected. Open Preferences → AI.' },
    };
    return;
  }
  const provider = getProvider(providerId);
  if (!provider) {
    yield {
      text: '',
      done: true,
      meta: { error: `Unknown provider: ${providerId}` },
    };
    return;
  }

  const ctrl = new AbortController();
  // Chain user-supplied signal to ours.
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort();
    else opts.signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  const entry: InFlight = {
    id: nextId++,
    providerId,
    modelId,
    startedAt: Date.now(),
    abort: () => ctrl.abort(),
  };
  inFlight.set(entry.id, entry);
  notifyListeners();

  try {
    for await (const chunk of provider.complete({
      ...opts,
      model: modelId,
      signal: ctrl.signal,
    })) {
      yield chunk;
      if (chunk.done) return;
    }
  } finally {
    inFlight.delete(entry.id);
    notifyListeners();
  }
}

/** Cancel all in-flight requests. Called from the status-bar click. */
export const cancelAll = (): void => {
  for (const f of inFlight.values()) {
    try {
      f.abort();
    } catch {
      /* ignore */
    }
  }
};
