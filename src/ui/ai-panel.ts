/**
 * AI side panel — the surface where manual AI commands (Rewrite, Continue,
 * Summarize, ...) render their output.
 *
 * Lives as a bottom-docked drawer so the editor isn't displaced. Streams
 * tokens with a pulsing accent border while in flight; accept/reject
 * controls land when the stream finishes.
 */

import { complete, cancelAll } from '../ai/manager';
import type { AICompleteOpts } from '../ai/provider';
import { toast } from './toast';

export interface AIPanelRunOpts {
  /** Human label for the panel header — "Rewrite", "Continue", etc. */
  title: string;
  /** The prompt (user-facing content to transform). */
  prompt: string;
  /** Optional surrounding context. */
  context?: string;
  /** Optional system prompt that describes the task. */
  system?: string;
  /** Called with the final text when the user accepts. */
  onAccept: (text: string) => void | Promise<void>;
  /** Optional — original text the response should compare against (for a label). */
  original?: string;
}

let hostEl: HTMLElement | null = null;

const ensureHost = (): HTMLElement => {
  if (hostEl) return hostEl;
  const el = document.createElement('aside');
  el.className = 'ai-panel';
  el.hidden = true;
  el.setAttribute('role', 'complementary');
  el.setAttribute('aria-label', 'AI response panel');
  el.innerHTML = `
    <header class="ai-panel__head">
      <span class="ai-panel__dot" aria-hidden="true"></span>
      <span class="ai-panel__title">AI</span>
      <span class="ai-panel__meta"></span>
      <button class="ai-panel__btn ai-panel__cancel" type="button" hidden>Cancel</button>
      <button class="ai-panel__btn ai-panel__close" type="button" aria-label="Close">&times;</button>
    </header>
    <div class="ai-panel__body">
      <pre class="ai-panel__out"></pre>
      <span class="ai-panel__caret" aria-hidden="true"></span>
    </div>
    <footer class="ai-panel__foot" hidden>
      <button class="ai-panel__btn ai-panel__reject" type="button">Discard</button>
      <button class="ai-panel__btn ai-panel__accept" type="button">Accept</button>
    </footer>
  `;
  document.body.appendChild(el);
  hostEl = el;
  el.querySelector<HTMLButtonElement>('.ai-panel__close')?.addEventListener('click', closePanel);
  el.querySelector<HTMLButtonElement>('.ai-panel__cancel')?.addEventListener('click', () => {
    cancelAll();
  });
  return el;
};

const closePanel = (): void => {
  if (!hostEl) return;
  hostEl.hidden = true;
  hostEl.dataset.state = 'idle';
  const out = hostEl.querySelector<HTMLElement>('.ai-panel__out');
  if (out) out.textContent = '';
  const foot = hostEl.querySelector<HTMLElement>('.ai-panel__foot');
  if (foot) foot.hidden = true;
};

export const runAICommand = async (opts: AIPanelRunOpts): Promise<void> => {
  const el = ensureHost();
  el.hidden = false;
  el.dataset.state = 'thinking';
  const title = el.querySelector<HTMLElement>('.ai-panel__title')!;
  const meta = el.querySelector<HTMLElement>('.ai-panel__meta')!;
  const out = el.querySelector<HTMLElement>('.ai-panel__out')!;
  const foot = el.querySelector<HTMLElement>('.ai-panel__foot')!;
  const cancelBtn = el.querySelector<HTMLButtonElement>('.ai-panel__cancel')!;
  const acceptBtn = el.querySelector<HTMLButtonElement>('.ai-panel__accept')!;
  const rejectBtn = el.querySelector<HTMLButtonElement>('.ai-panel__reject')!;

  title.textContent = opts.title;
  meta.textContent = 'Thinking\u2026';
  out.textContent = '';
  foot.hidden = true;
  cancelBtn.hidden = false;

  let accumulated = '';
  let errored = false;

  try {
    const req: Omit<AICompleteOpts, 'model'> & { provider?: string; model?: string } = {
      prompt: opts.prompt,
      context: opts.context,
      system: opts.system,
    };
    for await (const chunk of complete(req)) {
      if (el.dataset.state === 'thinking') {
        el.dataset.state = 'streaming';
        meta.textContent = 'Streaming\u2026';
      }
      if (chunk.text) {
        accumulated += chunk.text;
        out.textContent = accumulated;
      }
      if (chunk.meta?.error) {
        errored = true;
        out.textContent = accumulated + '\n\n[error: ' + String(chunk.meta.error) + ']';
        toast(`AI error: ${String(chunk.meta.error).slice(0, 160)}`);
      }
      if (chunk.meta?.cancelled) {
        meta.textContent = 'Cancelled';
        el.dataset.state = 'cancelled';
        cancelBtn.hidden = true;
        return;
      }
      if (chunk.done) break;
    }
  } catch (err) {
    errored = true;
    out.textContent = accumulated + '\n\n[error: ' + String(err) + ']';
  }

  cancelBtn.hidden = true;
  if (errored) {
    el.dataset.state = 'error';
    meta.textContent = 'Error';
    return;
  }

  el.dataset.state = 'done';
  meta.textContent = 'Ready';
  foot.hidden = false;

  const cleanup = (): void => {
    acceptBtn.onclick = null;
    rejectBtn.onclick = null;
  };
  acceptBtn.onclick = async () => {
    cleanup();
    await opts.onAccept(accumulated.trim());
    closePanel();
  };
  rejectBtn.onclick = () => {
    cleanup();
    closePanel();
  };
};

export const closeAIPanel = closePanel;
