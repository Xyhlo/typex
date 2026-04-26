/**
 * Central app state. Lightweight observer store — no framework.
 */

export interface DocTab {
  id: string;
  /** Filesystem path, or null for unsaved "Untitled" */
  path: string | null;
  /** File name or "Untitled N" */
  title: string;
  /** In-memory markdown content */
  content: string;
  /** Content as last persisted to disk (used to compute dirty state) */
  savedContent: string;
  /**
   * Pandoc format name the document was imported from (e.g., "docx", "rst").
   * Used to default Save As back to the original format. `null` means the
   * document is native markdown.
   */
  sourceFormat: string | null;
  /** File extension of the originally-opened file, drives Save As default ext. */
  sourceExt: string | null;
  /**
   * How TypeX should render and save this tab. `converted` means the visible
   * buffer is Markdown produced by Pandoc from a non-Markdown source file.
   */
  documentKind: DocumentKind;
  /** Syntax language for code tabs, if known. */
  language: string | null;
}

export type DocumentKind = "markdown" | "converted" | "code" | "text";
export type Theme = "dark" | "light";
export type EditorFont = "sans" | "serif";
export type ReadingMode = "vertical" | "horizontal";
export type ViewMode = "wysiwyg" | "raw" | "split";

export interface AppState {
  tabs: DocTab[];
  activeTabId: string | null;
  sidebarCollapsed: boolean;
  focusMode: boolean;
  theme: Theme;
  editorFont: EditorFont;
  readingMode: ReadingMode;
  viewMode: ViewMode;
  /**
   * Open workspace root folders. `workspaceRoots[0]` is the primary root
   * (used for single-root affordances like the git sync pill when no tab is
   * active). Empty when the user is in single-file mode.
   */
  workspaceRoots: string[];
}

type Listener = (state: AppState) => void;

let state: AppState = {
  tabs: [],
  activeTabId: null,
  sidebarCollapsed: false,
  focusMode: false,
  theme: "dark",
  editorFont: "sans",
  readingMode: "vertical",
  viewMode: "wysiwyg",
  workspaceRoots: [],
};

const listeners = new Set<Listener>();

export const getState = (): AppState => state;

export const subscribe = (fn: Listener): (() => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export const setState = (patch: Partial<AppState>): void => {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn(state));
};

export const updateTab = (id: string, patch: Partial<DocTab>): void => {
  setState({
    tabs: state.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  });
};

export const getActiveTab = (): DocTab | null => {
  if (!state.activeTabId) return null;
  return state.tabs.find((t) => t.id === state.activeTabId) ?? null;
};

export const isDirty = (tab: DocTab): boolean =>
  tab.content !== tab.savedContent;

let tabCounter = 0;
export const nextTabId = (): string => `tab-${Date.now()}-${++tabCounter}`;

let untitledCounter = 0;
export const nextUntitledTitle = (): string => {
  untitledCounter += 1;
  return untitledCounter === 1 ? "Untitled" : `Untitled ${untitledCounter}`;
};

/** Primary workspace root — first in the list, or null in single-file mode. */
export const primaryWorkspaceRoot = (): string | null =>
  state.workspaceRoots[0] ?? null;

/** Lower-case + forward-slash + no trailing slash — for equality checks. */
const normPath = (p: string): string =>
  p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

export const addWorkspaceRoot = (path: string): void => {
  const target = normPath(path);
  if (state.workspaceRoots.some((r) => normPath(r) === target)) return;
  setState({ workspaceRoots: [...state.workspaceRoots, path] });
};

export const removeWorkspaceRoot = (path: string): void => {
  const target = normPath(path);
  const next = state.workspaceRoots.filter((r) => normPath(r) !== target);
  if (next.length !== state.workspaceRoots.length) {
    setState({ workspaceRoots: next });
  }
};

export const setWorkspaceRoots = (paths: string[]): void => {
  // Dedupe while preserving order.
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const p of paths) {
    const k = normPath(p);
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(p);
  }
  setState({ workspaceRoots: deduped });
};

/** Return the root that contains `path`, or null if none do. */
export const rootContaining = (path: string): string | null => {
  const target = normPath(path);
  // Prefer the longest matching root (handles nested roots, though uncommon).
  let best: string | null = null;
  let bestLen = -1;
  for (const r of state.workspaceRoots) {
    const rn = normPath(r);
    if (target === rn || target.startsWith(rn + "/")) {
      if (rn.length > bestLen) {
        bestLen = rn.length;
        best = r;
      }
    }
  }
  return best;
};
