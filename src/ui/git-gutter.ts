/**
 * Raw-mode gutter overlay — shows git-diff status (added / modified /
 * removed-above) on the left edge of the raw markdown textarea.
 *
 * Visible only in `raw` and `split` view modes, and only when the active
 * document lives inside a git repo. Refreshed on: file load, file save,
 * view-mode change, and (in Wave 3) external FS events.
 *
 * Ctrl/Cmd-click on a line in the raw pane fires a blame lookup.
 */

import { subscribe as subscribeState, getState } from "../state";
import {
  gitDiffFile,
  gitBlameLine,
  type LineChange,
  type BlameEntry,
} from "../git";
import { isTauri } from "../fs/files";
import { toast } from "./toast";

interface InitOpts {
  /** Element the gutter marks will be positioned against. */
  textarea: HTMLTextAreaElement;
  /** Absolute-positioned host for the gutter marks. */
  host: HTMLElement;
}

let currentChanges: LineChange[] = [];
let currentLineHeight = 20;
let cachedOpts: InitOpts | null = null;
// Monotonic request token — avoids a stale diff clobbering a newer one.
let diffSeq = 0;

const measureLineHeight = (el: HTMLElement): number => {
  const cs = window.getComputedStyle(el);
  const lh = cs.lineHeight;
  if (lh.endsWith("px")) return parseFloat(lh);
  // Fallback: use font-size * 1.55 (matches our .raw-editor line-height).
  const fs = parseFloat(cs.fontSize);
  return isFinite(fs) ? fs * 1.55 : 20;
};

const measurePaddingTop = (el: HTMLElement): number => {
  return parseFloat(window.getComputedStyle(el).paddingTop) || 0;
};

const render = (opts: InitOpts): void => {
  const { host, textarea } = opts;
  host.replaceChildren();
  if (currentChanges.length === 0) {
    host.hidden = true;
    return;
  }
  host.hidden = false;

  const lineHeight = currentLineHeight;
  const padTop = measurePaddingTop(textarea);

  // Inner scrolling layer — height matches the textarea's scrollHeight so
  // marks live in "document" coordinates. We translate this layer by the
  // textarea's scrollTop to keep marks aligned.
  const layer = document.createElement("div");
  layer.className = "git-gutter__layer";
  layer.style.height = `${textarea.scrollHeight}px`;
  layer.style.transform = `translateY(-${textarea.scrollTop}px)`;
  host.appendChild(layer);

  for (const change of currentChanges) {
    const mark = document.createElement("div");
    mark.className = `git-gutter__mark git-gutter__mark--${change.kind}`;
    mark.dataset.line = String(change.line);
    mark.style.top = `${padTop + (change.line - 1) * lineHeight}px`;
    if (change.kind === "removed-above") {
      mark.style.height = "0";
    } else {
      mark.style.height = `${lineHeight}px`;
    }
    layer.appendChild(mark);
  }
};

export const refreshGitGutter = async (
  filePath: string | null,
): Promise<void> => {
  const opts = cachedOpts;
  if (!opts) return;
  const token = ++diffSeq;
  if (!filePath || !isTauri()) {
    currentChanges = [];
    render(opts);
    return;
  }
  const diff = await gitDiffFile(filePath);
  if (token !== diffSeq) return; // stale
  currentChanges = diff.in_repo ? diff.changes : [];
  render(opts);
};

const lineAtPosition = (text: string, pos: number): number => {
  // 1-indexed line number at a textarea character offset.
  let line = 1;
  for (let i = 0; i < pos && i < text.length; i++) {
    if (text[i] === "\n") line++;
  }
  return line;
};

const formatBlame = (b: BlameEntry): string => {
  if (b.not_committed) return "Uncommitted — no blame yet";
  const parts: string[] = [];
  if (b.short) parts.push(b.short);
  if (b.author) parts.push(b.author);
  if (b.time > 0) parts.push(formatRelative(new Date(b.time * 1000)));
  if (b.summary) parts.push(`"${b.summary}"`);
  return parts.length > 0 ? parts.join(" · ") : "Blame info unavailable";
};

const formatRelative = (d: Date): string => {
  const secs = Math.round((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`;
  if (secs < 86400 * 30) return `${Math.round(secs / 86400)}d ago`;
  return d.toLocaleDateString();
};

export const initGitGutter = (opts: InitOpts): void => {
  cachedOpts = opts;
  const { textarea, host } = opts;
  currentLineHeight = measureLineHeight(textarea);

  // Keep the gutter layer aligned when the user scrolls the textarea.
  textarea.addEventListener("scroll", () => {
    const layer = host.querySelector<HTMLElement>(".git-gutter__layer");
    if (layer) layer.style.transform = `translateY(-${textarea.scrollTop}px)`;
  });

  // Re-measure on font-size changes (zoom, pref updates) via a ResizeObserver
  // on the textarea itself.
  const ro = new ResizeObserver(() => {
    currentLineHeight = measureLineHeight(textarea);
    render(opts);
  });
  ro.observe(textarea);

  // Blame on Ctrl/Cmd-click. Read the active tab from state (not the module-
  // local `currentPath`) so a rapid tab switch between mousedown and click
  // can't blame the wrong file.
  textarea.addEventListener("click", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const s = getState();
    const active = s.tabs.find((t) => t.id === s.activeTabId);
    const path = active?.path ?? null;
    if (!path) {
      toast("Save the file to see blame");
      return;
    }
    const pos = textarea.selectionStart;
    const line = lineAtPosition(textarea.value, pos);
    void (async () => {
      const blame = await gitBlameLine(path, line);
      if (!blame) {
        toast("No blame available");
        return;
      }
      toast(formatBlame(blame));
    })();
  });

  // Subscribe to state changes so we re-fetch when the active tab swaps.
  let lastFilePath: string | null = null;
  subscribeState(() => {
    const s = getState();
    const active = s.tabs.find((t) => t.id === s.activeTabId);
    const path = active?.path ?? null;
    if (path !== lastFilePath) {
      lastFilePath = path;
      void refreshGitGutter(path);
    }
  });
};
