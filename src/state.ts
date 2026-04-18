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
}

export type Theme = "dark" | "light";
export type EditorFont = "sans" | "serif";
export type ReadingMode = "vertical" | "horizontal";

export interface AppState {
  tabs: DocTab[];
  activeTabId: string | null;
  sidebarCollapsed: boolean;
  focusMode: boolean;
  theme: Theme;
  editorFont: EditorFont;
  readingMode: ReadingMode;
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
};

const listeners = new Set<Listener>();

export const getState = (): AppState => state;

export const subscribe = (fn: Listener): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
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
