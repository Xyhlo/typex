/**
 * Inline autocomplete driver.
 *
 * Owns the debounce, the AI call, and the translation of streaming chunks
 * into ghost-text updates. The ghost-text plugin handles the rendering and
 * the accept/dismiss key events; this file decides *when* to ask and *what*
 * to pass to the model.
 *
 * Off by default. Enabled via Preferences or the "AI: toggle inline
 * autocomplete" palette command. Requires an active provider + model.
 *
 * CLI agents (Claude Code, Codex, Gemini CLI, paseo) advertise
 * `supportsAutocomplete: false` and are skipped — their chat fine-tuning
 * makes them meta-respond instead of continuing prose.
 *
 * Phase 4 Wave 3; hardened after Wave 4.
 */
import type { EditorView } from "@milkdown/prose/view";
import {
  setGhost,
  clearGhost,
  onGhostTick,
} from "../editor/ghost-text";
import { complete, getActive } from "./manager";
import { loadPrefs } from "../session";

interface RunState {
  debounce: number | null;
  abort: AbortController | null;
  /**
   * Bumped every time a new request is scheduled. Stale chunks arriving
   * after the user has moved on are discarded by comparing their captured
   * generation against the current one.
   */
  generation: number;
}

const controllers = new Map<EditorView, RunState>();
const detachers = new Map<EditorView, () => void>();

/**
 * Don't bother asking the model for a continuation of trivially short text —
 * you get low-quality noise suggestions. 32 chars is ~6–8 words.
 */
const MIN_CONTEXT_CHARS = 32;
/**
 * Cap the context we hand to the model. Long context blows latency and
 * token cost; 1200 chars (~300 tokens) is enough for the immediate voice
 * without dragging the whole document along.
 */
const MAX_CONTEXT_CHARS = 1200;
/** Tight token budget — suggestions should be a sentence or two, not an essay. */
const MAX_SUGGESTION_TOKENS = 64;
/** Throttle ghost-text updates so rapid chunks don't cause churn. */
const REFRESH_THROTTLE_MS = 40;

/**
 * Default system prompt. Very assertive — chat-tuned models tend to introduce
 * themselves or meta-respond unless the role is framed as a completion engine,
 * not an assistant.
 */
export const DEFAULT_AUTOCOMPLETE_PROMPT =
  "You are a SILENT text-completion engine embedded in a Markdown editor. " +
  "The user is typing; your job is to emit the next 1–2 sentences that " +
  "naturally continue their text. Absolutely binding rules:\n" +
  "  • Emit ONLY the continuation text — no preamble, no summary, no meta.\n" +
  "  • DO NOT introduce yourself, describe your role, or offer help.\n" +
  "  • DO NOT ask the user questions.\n" +
  "  • DO NOT wrap the output in quotes, code fences, or Markdown.\n" +
  "  • DO NOT restate any part of the input.\n" +
  "  • If you have nothing useful to add, output an empty string.\n" +
  "  • Stop at the next natural breakpoint (end of sentence or paragraph).\n" +
  "  • Match the user's voice, register, tense, and language exactly.\n" +
  "Treat the input as raw text to extend, not as a question to answer.";

/**
 * Phrases that unambiguously indicate an assistant meta-response, rather
 * than a genuine continuation of the user's prose. Deliberately narrow —
 * false positives here turn legitimate ghost text into ghost-nothing, so
 * we only block the phrases models produce when they've broken character.
 */
const BANNED_PREFIXES = [
  // Self-identification
  "i'm claude",
  "i'm chatgpt",
  "i'm gpt-",
  "i'm gemini",
  "i'm an ai",
  "i'm a language model",
  "i am claude",
  "i am an ai",
  "as an ai",
  "as a language model",
  // Canned assistant openings that almost never start real prose
  "i'd be happy to help",
  "i'd be glad to help",
  "i can help you",
  "i'll help you",
  "sure, here's",
  "sure! here's",
  "sure, here is",
  "certainly! here",
  "certainly, here",
  "of course! here",
  "of course, here",
  "great question",
  "hi there",
  "here you go",
  "here's the continuation",
  "here is the continuation",
];

const looksLikeMetaResponse = (text: string): boolean => {
  const t = text.trimStart().toLowerCase();
  if (t.length === 0) return false;
  return BANNED_PREFIXES.some((p) => t.startsWith(p));
};

/** Attach the autocomplete driver to an editor view. Idempotent per-view. */
export const attachAutocomplete = (view: EditorView): void => {
  if (controllers.has(view)) return;
  const state: RunState = {
    debounce: null,
    abort: null,
    generation: 0,
  };
  controllers.set(view, state);
  const detach = onGhostTick((v) => {
    if (v !== view) return;
    scheduleTick(view);
  });
  detachers.set(view, detach);
};

/** Detach, cancel any in-flight request, and clear the ghost. */
export const detachAutocomplete = (view: EditorView): void => {
  const state = controllers.get(view);
  if (state) {
    if (state.debounce !== null) {
      window.clearTimeout(state.debounce);
      state.debounce = null;
    }
    state.abort?.abort();
    state.abort = null;
    state.generation++;
    try {
      clearGhost(view);
    } catch {
      /* ignore */
    }
  }
  controllers.delete(view);
  const d = detachers.get(view);
  if (d) {
    try {
      d();
    } catch {
      /* ignore */
    }
  }
  detachers.delete(view);
};

const gatherContext = (
  view: EditorView,
): { text: string; cursor: number } | null => {
  const { selection, doc } = view.state;
  if (selection.from !== selection.to) return null;
  const cursor = selection.from;
  const start = Math.max(0, cursor - MAX_CONTEXT_CHARS);
  const text = doc.textBetween(start, cursor, "\n", "\n");
  if (text.trim().length < MIN_CONTEXT_CHARS) return null;
  return { text, cursor };
};

const scheduleTick = (view: EditorView): void => {
  const state = controllers.get(view);
  if (!state) return;
  if (state.abort) {
    state.abort.abort();
    state.abort = null;
  }
  if (state.debounce !== null) {
    window.clearTimeout(state.debounce);
    state.debounce = null;
  }
  try {
    clearGhost(view);
  } catch {
    /* ignore */
  }

  const prefs = loadPrefs();
  if (!prefs.aiEnabled || !prefs.aiAutocomplete) return;
  const active = getActive();
  if (!active) return;

  // Every provider is allowed to try ghost text. The strict system prompt
  // plus the meta-response scrubber in fireRequest() handles chat-tuned
  // providers that drift into self-introduction mode — if they do, the
  // suggestion never renders. Worst case is no ghost text, never a bad one.

  const delay = Math.max(200, Math.min(5000, prefs.aiAutocompleteDelayMs ?? 700));
  state.debounce = window.setTimeout(() => {
    state.debounce = null;
    void fireRequest(view);
  }, delay);
};

const fireRequest = async (view: EditorView): Promise<void> => {
  const state = controllers.get(view);
  if (!state) return;
  const ctx = gatherContext(view);
  if (!ctx) return;

  const gen = ++state.generation;
  const ctrl = new AbortController();
  state.abort = ctrl;

  const prefs = loadPrefs();
  const system = prefs.aiAutocompletePrompt?.trim() || DEFAULT_AUTOCOMPLETE_PROMPT;

  // Frame the input as raw text-to-extend, not a task. A visible sentinel
  // (`<<<TEXT>>>`) plus the plain continuation request keeps even chat models
  // closer to completion behavior.
  const userPrompt =
    "Continue this text. Emit ONLY the continuation — no preamble, no meta, " +
    "no self-introduction. If nothing useful, emit nothing.\n\n" +
    "<<<TEXT>>>\n" +
    ctx.text +
    "\n<<<END>>>\n\nContinuation:";

  let buffer = "";
  let lastFlush = 0;
  let aborted = false;

  const flush = (force: boolean): void => {
    const current = controllers.get(view);
    if (!current || gen !== current.generation) return;
    if (aborted) return;
    const now = Date.now();
    if (!force && now - lastFlush < REFRESH_THROTTLE_MS) return;
    lastFlush = now;
    const trimmed = buffer.replace(/\s+$/, "");
    if (trimmed.length === 0) return;
    // Scrub meta-responses — if the model broke character, cancel.
    if (looksLikeMetaResponse(trimmed)) {
      aborted = true;
      ctrl.abort();
      try {
        clearGhost(view);
      } catch {
        /* ignore */
      }
      return;
    }
    if (view.state.selection.from !== ctx.cursor) return;
    try {
      setGhost(view, trimmed, ctx.cursor);
    } catch {
      /* view destroyed */
    }
  };

  try {
    for await (const chunk of complete({
      system,
      prompt: userPrompt,
      maxTokens: MAX_SUGGESTION_TOKENS,
      temperature: 0.4,
      signal: ctrl.signal,
    })) {
      const current = controllers.get(view);
      if (!current || gen !== current.generation) return;
      if (chunk.text) buffer += chunk.text;
      if (chunk.done) {
        flush(true);
        return;
      }
      flush(false);
    }
    flush(true);
  } catch (err) {
    if (!ctrl.signal.aborted) {
      console.warn("[autocomplete] request failed:", err);
    }
  } finally {
    const current = controllers.get(view);
    if (current && current.abort === ctrl) current.abort = null;
  }
};
