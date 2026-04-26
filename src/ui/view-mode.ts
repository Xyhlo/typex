/**
 * Tri-mode controller — manages WYSIWYG, raw, and split views.
 *
 * Sync rules:
 *   - On entering raw or split: populate textarea from the active tab content.
 *   - Typing in textarea: debounced (80 ms) → update tab.content.
 *     In raw-only mode this is all that's needed. In split, we then push the
 *     new content into the WYSIWYG editor so the right pane reflects the left.
 *   - Typing in WYSIWYG: onChange already updates tab.content via main.ts's
 *     existing onChange hook. In split, we listen to tab content changes and
 *     re-populate the textarea *only when it isn't focused* — avoids clobbering
 *     the user's caret in the raw pane.
 *   - Tab switch: textarea is re-populated from the newly active tab.
 *
 * Cursor sync between panes is explicitly out of scope for this pass. Editing
 * happens in one pane at a time; caret follows focus.
 */

import {
  getState,
  setState,
  subscribe as subscribeState,
  updateTab,
  type ViewMode,
} from "../state";
import type { EditorController } from "../editor/editor";

interface InitOpts {
  editor: EditorController;
  /** Called when content changes from the raw pane. Updates the WYSIWYG editor. */
  applyContentToEditor: (md: string) => Promise<void>;
}

let textarea: HTMLTextAreaElement | null = null;
let panes: HTMLElement | null = null;
let rawApplying = false;
let lastTabId: string | null = null;
let debounceTimer: number | null = null;

const syncPanesFromState = (): void => {
  if (!panes) return;
  const state = getState();
  const active = state.tabs.find((t) => t.id === state.activeTabId);
  panes.dataset.viewMode = state.viewMode;
  panes.dataset.documentKind = active?.documentKind ?? "markdown";
};

const populateTextarea = (): void => {
  if (!textarea) return;
  const s = getState();
  const active = s.tabs.find((t) => t.id === s.activeTabId);
  const content = active?.content ?? "";
  if (textarea.value === content) return;
  // Preserve cursor only if this tab hasn't changed AND the textarea is focused.
  if (document.activeElement === textarea && lastTabId === s.activeTabId) {
    return; // user is typing — leave it alone; onChange loop will reconcile
  }
  const prevSelStart = textarea.selectionStart;
  const prevSelEnd = textarea.selectionEnd;
  const shouldRestoreCaret = lastTabId === s.activeTabId;
  textarea.value = content;
  if (shouldRestoreCaret) {
    try {
      textarea.setSelectionRange(prevSelStart, prevSelEnd);
    } catch {
      /* ignore */
    }
  }
  lastTabId = s.activeTabId;
};

const scheduleApply = (md: string, opts: InitOpts): void => {
  if (debounceTimer !== null) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    const s = getState();
    const active = s.tabs.find((t) => t.id === s.activeTabId);
    if (!active) return;
    updateTab(active.id, { content: md });
    // In split mode, also push to the WYSIWYG editor so it updates live.
    if (s.viewMode === "split") {
      rawApplying = true;
      void opts.applyContentToEditor(md).finally(() => {
        rawApplying = false;
      });
    }
  }, 80);
};

export const initViewMode = (opts: InitOpts): void => {
  panes = document.getElementById("editor-panes");
  textarea = document.getElementById("raw-editor") as HTMLTextAreaElement | null;
  if (!panes || !textarea) return;

  lastTabId = getState().activeTabId;

  textarea.addEventListener("input", () => {
    if (!textarea) return;
    scheduleApply(textarea.value, opts);
  });

  // Subscribe to state changes: tab switches, view-mode changes, content updates
  // caused by the WYSIWYG editor.
  subscribeState(() => {
    syncPanesFromState();
    const mode = getState().viewMode;
    if (mode === "raw" || mode === "split") {
      // In split, don't re-populate if this change came from the raw pane itself.
      if (!(mode === "split" && rawApplying)) populateTextarea();
    }
  });

  syncPanesFromState();
};

/**
 * Flip the view mode. When leaving raw, the textarea's current value is
 * pushed into the WYSIWYG editor (in case a debounce is still pending).
 */
export const setViewMode = async (mode: ViewMode, opts: InitOpts): Promise<void> => {
  const current = getState().viewMode;
  if (current === mode) return;

  // Flush any pending raw-pane edits before leaving raw.
  if ((current === "raw" || current === "split") && textarea && debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
    debounceTimer = null;
    const s = getState();
    const active = s.tabs.find((t) => t.id === s.activeTabId);
    if (active) updateTab(active.id, { content: textarea.value });
  }

  // If we were in raw (no live WYSIWYG updates), push the final content now.
  if (current === "raw" && textarea) {
    await opts.applyContentToEditor(textarea.value);
  }

  setState({ viewMode: mode });

  // Entering raw/split: populate textarea; focus the raw pane (it's the new
  // surface in both modes).
  if (mode === "raw" || mode === "split") {
    populateTextarea();
    requestAnimationFrame(() => textarea?.focus());
  } else {
    // Entering wysiwyg — focus the editor.
    requestAnimationFrame(() => opts.editor.focus());
  }
};

export const toggleRawMode = (opts: InitOpts): void => {
  const current = getState().viewMode;
  const next: ViewMode = current === "raw" ? "wysiwyg" : "raw";
  void setViewMode(next, opts);
};

export const toggleSplitMode = (opts: InitOpts): void => {
  const current = getState().viewMode;
  const next: ViewMode = current === "split" ? "wysiwyg" : "split";
  void setViewMode(next, opts);
};
