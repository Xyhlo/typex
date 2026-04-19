/**
 * Gradual stream-apply — even when the OS delivers an external write as a
 * single atomic event, this "types out" the new content over ~400ms so the
 * user sees characters appearing rather than a full-doc snap.
 *
 * Strategy:
 *   - Find the common prefix of `oldContent` and `newContent`.
 *   - If `oldContent` has trailing content past the prefix (a real edit in
 *     place), apply the prefix first (truncating the replaced region) so the
 *     stream grows from a clean state.
 *   - Schedule `N` rAF ticks that call `replaceAll(partial)` with an
 *     ever-growing prefix of `newContent` until the full target is applied.
 *
 * Superseding: if a new target arrives mid-stream, we jump to it (dropping
 * older intermediate steps). This way rapid-fire stream chunks don't queue
 * up into a sluggish animation.
 */

import type { Editor } from "@milkdown/core";
import { replaceAll } from "@milkdown/utils";

interface StreamState {
  raf: number | null;
  target: string | null;
  applied: number;
  chunkSize: number;
  /**
   * Current caller's onDone — resolved when the stream finishes naturally
   * OR when a newer target supersedes it. Without this, the outgoing
   * caller's promise leaks forever and `applyingExternalContent` in main.ts
   * stays true, making the editor unresponsive to user input.
   */
  onDone: (() => void) | null;
}

const states = new WeakMap<Editor, StreamState>();

const longestCommonPrefix = (a: string, b: string): number => {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i;
};

const getState = (editor: Editor): StreamState => {
  let s = states.get(editor);
  if (!s) {
    s = { raf: null, target: null, applied: 0, chunkSize: 1, onDone: null };
    states.set(editor, s);
  }
  return s;
};

/** Cancel any in-flight stream AND resolve its caller's promise. */
const cancelAndResolve = (s: StreamState): void => {
  if (s.raf !== null) {
    cancelAnimationFrame(s.raf);
    s.raf = null;
  }
  const prev = s.onDone;
  s.onDone = null;
  s.target = null;
  if (prev) {
    try {
      prev();
    } catch (err) {
      console.error("[stream-apply] outgoing onDone threw:", err);
    }
  }
};

export interface StreamApplyOpts {
  /** When true, animate. When false, this helper falls back to atomic replace. */
  animate: boolean;
  /**
   * Characters below this delta size are applied atomically — tiny changes
   * don't benefit from animation and the flicker is unpleasant.
   */
  minAnimateDelta?: number;
  /**
   * Above this doc size (chars), we skip animation to avoid 40 repeated
   * markdown re-parses on a huge document.
   */
  maxAnimateDocSize?: number;
  /** Approximate total animation time for a full-file insert. */
  totalDurationMs?: number;
  /** Called after each incremental apply — useful for updating a caret. */
  onTick?: (appliedChars: number, totalChars: number) => void;
  /** Called when the full target has been applied or superseded. */
  onDone?: () => void;
}

/**
 * Schedule a streaming apply. Safe to call while a prior stream is in flight
 * — the newer target wins and the older animation is dropped.
 */
export const streamApply = (
  editor: Editor,
  oldContent: string,
  newContent: string,
  opts: StreamApplyOpts,
): void => {
  const {
    animate,
    minAnimateDelta = 24,
    maxAnimateDocSize = 60_000,
    totalDurationMs = 400,
    onTick,
    onDone,
  } = opts;

  const s = getState(editor);
  // Cancel any prior stream AND resolve its onDone so the prior caller's
  // promise doesn't leak.
  cancelAndResolve(s);

  // Fast paths — skip animation.
  const delta = Math.abs(newContent.length - oldContent.length);
  const tooBig = newContent.length > maxAnimateDocSize;
  if (!animate || delta < minAnimateDelta || tooBig) {
    void editor.action(replaceAll(newContent));
    onTick?.(newContent.length, newContent.length);
    onDone?.();
    return;
  }

  const prefixLen = longestCommonPrefix(oldContent, newContent);
  // If the old content had stuff past the common prefix, truncate first so
  // the stream appears to grow from a clean tail rather than overwriting.
  const oldHasDivergence = oldContent.length > prefixLen;
  if (oldHasDivergence) {
    void editor.action(replaceAll(newContent.slice(0, prefixLen)));
  }

  s.target = newContent;
  s.applied = prefixLen;
  s.onDone = onDone ?? null;
  const remaining = newContent.length - prefixLen;
  const ticks = Math.max(1, Math.round(totalDurationMs / 16));
  s.chunkSize = Math.max(1, Math.ceil(remaining / ticks));

  const step = (): void => {
    s.raf = null;
    // Superseded while we were sleeping — the new caller's
    // cancelAndResolve() already fired the outgoing onDone, so just bail.
    if (s.target !== newContent) return;
    s.applied = Math.min(s.applied + s.chunkSize, newContent.length);
    const partial = newContent.slice(0, s.applied);
    void editor.action(replaceAll(partial));
    onTick?.(s.applied, newContent.length);
    if (s.applied < newContent.length) {
      s.raf = requestAnimationFrame(step);
    } else {
      // Natural completion — fire our onDone and clear slot (don't call
      // cancelAndResolve here, which would re-fire onDone).
      s.target = null;
      s.onDone = null;
      onDone?.();
    }
  };
  s.raf = requestAnimationFrame(step);
};

/** Stop any in-flight stream for this editor and resolve its caller. */
export const cancelStreamApply = (editor: Editor): void => {
  const s = states.get(editor);
  if (!s) return;
  cancelAndResolve(s);
};
