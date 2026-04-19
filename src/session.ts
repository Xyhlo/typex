const SESSION_KEY = "typex:session";
const PREFS_KEY = "typex:prefs";

export interface SessionData {
  openFiles: string[];
  activePath: string | null;
  /** @deprecated superseded by `workspaceRoots`; kept for forward-migrating old sessions. */
  workspaceRoot: string | null;
  workspaceRoots: string[];
}

export interface Prefs {
  autosave: boolean;
  autosaveInterval: number;
  typewriter: boolean;
  readingMode: "vertical" | "horizontal";
  editorFont: "sans" | "serif";
  /**
   * When true, File → Open File presents every format TypeX can import
   * (Word, OpenDocument, EPUB, LaTeX, reST, AsciiDoc, Org, …).
   * When false, only Markdown-family files show up in the dialog.
   */
  openAllFormats: boolean;
  /** Wave 4: autocommit after file save (debounced). */
  autocommit: boolean;
  /** Wave 4: debounce window for autocommit (ms). */
  autocommitDelayMs: number;
  /** Wave 4: push after each autocommit. Requires git credential helper. */
  autopush: boolean;
  /** Wave 4: `git pull --ff-only` when the window regains focus. */
  autopullOnFocus: boolean;
  /**
   * Streaming: apply external writes live even when the tab has unsaved
   * edits. When off (default), the existing "Keep mine / Reload" modal
   * continues to gate dirty-tab conflicts.
   */
  liveReload: boolean;
  /** Pulse tabs and flash changed regions when external writes land. */
  animateExternalEdits: boolean;
  /** Phase 4: AI feature master toggle. Off by default. */
  aiEnabled: boolean;
  /** Phase 4: selected provider id (e.g. "ollama", "anthropic"). */
  aiProvider: string;
  /** Phase 4: selected model id (provider-scoped). */
  aiModel: string;
  /**
   * Phase 4 Wave 3: inline ghost-text autocomplete. Off by default — it's
   * experimental and noisy for users who don't want AI suggestions as they type.
   */
  aiAutocomplete: boolean;
  /** Debounce before the ghost-text request fires after typing stops (ms). */
  aiAutocompleteDelayMs: number;
  /**
   * System prompt handed to the model for ghost-text autocomplete. Empty
   * string = use the built-in default. Users can tune this for their vendor.
   */
  aiAutocompletePrompt: string;
}

const DEFAULT_PREFS: Prefs = {
  autosave: false,
  autosaveInterval: 15_000,
  typewriter: false,
  readingMode: "vertical",
  editorFont: "sans",
  openAllFormats: true,
  autocommit: false,
  autocommitDelayMs: 15_000,
  autopush: false,
  autopullOnFocus: false,
  // ON by default — the whole point of streaming is that an AI writing into
  // the file replaces content with visible animations rather than a modal
  // per chunk. Users who want the old safety net can turn it off.
  liveReload: true,
  animateExternalEdits: true,
  aiEnabled: false,
  aiProvider: '',
  aiModel: '',
  aiAutocomplete: false,
  aiAutocompleteDelayMs: 700,
  aiAutocompletePrompt: '',
};

export const loadSession = (): SessionData => {
  const empty: SessionData = {
    openFiles: [],
    activePath: null,
    workspaceRoot: null,
    workspaceRoots: [],
  };
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return empty;
    const s = JSON.parse(raw);
    const roots = Array.isArray(s.workspaceRoots)
      ? (s.workspaceRoots as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    // Migrate old single-root sessions.
    const legacy =
      typeof s.workspaceRoot === "string" && s.workspaceRoot.length > 0
        ? s.workspaceRoot
        : null;
    if (legacy && !roots.includes(legacy)) roots.unshift(legacy);
    return {
      openFiles: Array.isArray(s.openFiles)
        ? (s.openFiles as unknown[]).filter((x): x is string => typeof x === "string")
        : [],
      activePath: typeof s.activePath === "string" ? s.activePath : null,
      workspaceRoot: legacy,
      workspaceRoots: roots,
    };
  } catch {
    return empty;
  }
};

export const saveSession = (s: SessionData): void => {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
};

export const loadPrefs = (): Prefs => {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
};

export const savePrefs = (p: Prefs): void => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
};
