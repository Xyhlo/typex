/**
 * Vault index — a shared, reactive index over the current workspace folder.
 *
 * Parses every markdown file in the workspace for:
 *   - title (first H1, else filename)
 *   - tags (#tag in prose, excluded from code fences / frontmatter / URLs)
 *   - wikilinks ([[target]] or [[target|alias]])
 *   - frontmatter (minimal YAML: key: value and simple arrays)
 *
 * Tags, backlinks, and the properties panel all read from this single source.
 *
 * Usage:
 *   setWorkspaceRoot("/path/to/folder")  // re-scans
 *   onFileSaved(path, content)           // targeted update after save
 *   onFileDeleted(path)                  // targeted removal
 *   subscribe(fn)                         // reactive — fires after any change
 *   resolveWikilink("My Note")           // → absolute path or null
 */

import { readWorkspace, readFile, basename, type DirEntryNode } from "../fs/files";

export interface VaultFile {
  path: string;
  /** basename without extension — the canonical wikilink target */
  name: string;
  /** first H1 if present, else `name` */
  title: string;
  /** tags without the leading `#` */
  tags: string[];
  /** wikilink targets referenced in this file */
  wikilinks: string[];
  frontmatter: Record<string, string | string[]>;
}

interface VaultSnapshot {
  /** @deprecated use `roots` */
  root: string | null;
  roots: string[];
  files: ReadonlyMap<string, VaultFile>;
  /** tag (lowercase) → set of file paths that contain it */
  tagToFiles: ReadonlyMap<string, ReadonlySet<string>>;
  /** lowercase name → file path, for wikilink resolution */
  nameToPath: ReadonlyMap<string, string>;
  /** target wikilink (lowercase name) → set of file paths that link to it */
  backlinks: ReadonlyMap<string, ReadonlySet<string>>;
}

type Listener = (snapshot: VaultSnapshot) => void;

let roots: string[] = [];
const files = new Map<string, VaultFile>();
const tagToFiles = new Map<string, Set<string>>();
const nameToPath = new Map<string, string>();
const backlinks = new Map<string, Set<string>>();
const listeners = new Set<Listener>();

const stripExt = (name: string): string => name.replace(/\.[^.]+$/, "");

const flattenMarkdown = (node: DirEntryNode, out: string[]): void => {
  if (!node.isDirectory) {
    const lower = node.name.toLowerCase();
    if (lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".mdx")) {
      out.push(node.path);
    }
    return;
  }
  for (const c of node.children ?? []) flattenMarkdown(c, out);
};

/* ========== parsing ========== */

const FRONTMATTER_FENCE = /^---\s*$/;

const parseFrontmatter = (
  lines: string[],
): { frontmatter: Record<string, string | string[]>; bodyStart: number } => {
  if (lines.length === 0 || !FRONTMATTER_FENCE.test(lines[0])) {
    return { frontmatter: {}, bodyStart: 0 };
  }
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (FRONTMATTER_FENCE.test(lines[i])) {
      end = i;
      break;
    }
  }
  if (end === -1) return { frontmatter: {}, bodyStart: 0 };

  const result: Record<string, string | string[]> = {};
  let currentKey: string | null = null;
  let currentList: string[] | null = null;

  for (let i = 1; i < end; i++) {
    const line = lines[i];
    // List continuation
    if (currentList && /^\s+-\s+/.test(line)) {
      currentList.push(line.replace(/^\s+-\s+/, "").trim().replace(/^["']|["']$/g, ""));
      continue;
    }
    if (currentList && line.trim() === "") continue;
    if (currentList && currentKey) {
      result[currentKey] = currentList;
      currentKey = null;
      currentList = null;
    }

    const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    const raw = m[2].trim();
    if (raw === "") {
      // multi-line list follows
      currentKey = key;
      currentList = [];
      continue;
    }
    // inline array: [a, b, "c"]
    if (raw.startsWith("[") && raw.endsWith("]")) {
      const inner = raw.slice(1, -1).trim();
      result[key] = inner
        ? inner.split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""))
        : [];
      continue;
    }
    result[key] = raw.replace(/^["']|["']$/g, "");
  }
  if (currentList && currentKey) result[currentKey] = currentList;

  return { frontmatter: result, bodyStart: end + 1 };
};

const TAG_RE = /(?:^|[\s(])(#[A-Za-z][\w/-]*)/g;
const WIKILINK_RE = /\[\[([^\]|\n]+?)(?:\|[^\]\n]*)?\]\]/g;
const H1_RE = /^#\s+(.+?)\s*#*\s*$/;
const FENCE_RE = /^(\s*)(```|~~~)/;
const URL_HASH_RE = /https?:\/\/\S*#/i;

const parseMarkdown = (path: string, content: string): VaultFile => {
  const name = stripExt(basename(path));
  const lines = content.split("\n");
  const { frontmatter, bodyStart } = parseFrontmatter(lines);

  const tagsSet = new Set<string>();
  const wikilinksSet = new Set<string>();
  let title: string | null = null;
  let inFence: "`" | "~" | null = null;

  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i];
    const fm = FENCE_RE.exec(line);
    if (fm) {
      const tick = fm[2];
      if (inFence === null) {
        inFence = tick.startsWith("`") ? "`" : "~";
        continue;
      }
      if ((inFence === "`" && tick.startsWith("`")) || (inFence === "~" && tick.startsWith("~"))) {
        inFence = null;
        continue;
      }
    }
    if (inFence) continue;

    if (title === null) {
      const h = H1_RE.exec(line);
      if (h) title = h[1].trim();
    }

    // Tags — skip lines that contain URLs with fragments (avoid false positives).
    if (!URL_HASH_RE.test(line)) {
      TAG_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = TAG_RE.exec(line)) !== null) {
        tagsSet.add(m[1].slice(1).toLowerCase());
      }
    }

    WIKILINK_RE.lastIndex = 0;
    let w: RegExpExecArray | null;
    while ((w = WIKILINK_RE.exec(line)) !== null) {
      wikilinksSet.add(w[1].trim());
    }
  }

  return {
    path,
    name,
    title: title ?? name,
    tags: [...tagsSet],
    wikilinks: [...wikilinksSet],
    frontmatter,
  };
};

/* ========== index maintenance ========== */

const reindexOne = (file: VaultFile): void => {
  removeFromIndex(file.path);
  files.set(file.path, file);
  const nameKey = file.name.toLowerCase();
  const existing = nameToPath.get(nameKey);
  if (existing && existing !== file.path) {
    // Two files with the same basename — wikilinks to this name become
    // ambiguous. We keep the last-indexed winner (mirrors Obsidian) and log
    // so the user can spot it in devtools.
    console.warn(
      `[vault] wikilink name "${file.name}" is ambiguous — "${existing}" is shadowed by "${file.path}"`,
    );
  }
  nameToPath.set(nameKey, file.path);
  for (const tag of file.tags) {
    let set = tagToFiles.get(tag);
    if (!set) {
      set = new Set();
      tagToFiles.set(tag, set);
    }
    set.add(file.path);
  }
  for (const target of file.wikilinks) {
    const key = target.toLowerCase();
    let set = backlinks.get(key);
    if (!set) {
      set = new Set();
      backlinks.set(key, set);
    }
    set.add(file.path);
  }
};

const removeFromIndex = (path: string): void => {
  const prev = files.get(path);
  if (!prev) return;
  files.delete(path);
  for (const tag of prev.tags) {
    const set = tagToFiles.get(tag);
    if (!set) continue;
    set.delete(path);
    if (set.size === 0) tagToFiles.delete(tag);
  }
  for (const target of prev.wikilinks) {
    const key = target.toLowerCase();
    const set = backlinks.get(key);
    if (!set) continue;
    set.delete(path);
    if (set.size === 0) backlinks.delete(key);
  }
  // nameToPath: only remove if this path currently owns the name.
  const nameKey = prev.name.toLowerCase();
  if (nameToPath.get(nameKey) === path) nameToPath.delete(nameKey);
};

const snapshot = (): VaultSnapshot => ({
  root: roots[0] ?? null,
  roots: [...roots],
  files,
  tagToFiles,
  nameToPath,
  backlinks,
});

const notify = (): void => {
  const snap = snapshot();
  for (const fn of listeners) fn(snap);
};

/* ========== public API ========== */

/**
 * Rescan `roots` from scratch. Pass an empty array to clear the index.
 * Kept named `setWorkspaceRoot` for source-compat with the pre-multi-root
 * call sites; accepts either a single path or a list.
 */
export const setWorkspaceRoot = async (
  newRoot: string | null | string[],
): Promise<void> => {
  const next = newRoot == null
    ? []
    : Array.isArray(newRoot)
      ? newRoot.slice()
      : [newRoot];
  return setWorkspaceRoots(next);
};

export const setWorkspaceRoots = async (newRoots: string[]): Promise<void> => {
  roots = newRoots.slice();
  files.clear();
  tagToFiles.clear();
  nameToPath.clear();
  backlinks.clear();

  if (roots.length === 0) {
    notify();
    return;
  }

  const pathSet = new Set<string>();
  const pathList: string[] = [];
  for (const r of roots) {
    try {
      const tree = await readWorkspace(r);
      const local: string[] = [];
      flattenMarkdown(tree, local);
      for (const p of local) {
        const key = normPath(p);
        if (pathSet.has(key)) continue; // dedupe across nested roots
        pathSet.add(key);
        pathList.push(p);
      }
    } catch {
      /* skip unreadable root */
    }
  }

  // Parse in small batches so we don't block the main thread on large vaults.
  const BATCH = 25;
  for (let i = 0; i < pathList.length; i += BATCH) {
    const slice = pathList.slice(i, i + BATCH);
    await Promise.all(
      slice.map(async (p) => {
        try {
          const content = await readFile(p);
          reindexOne(parseMarkdown(p, content));
        } catch {
          /* skip unreadable files */
        }
      }),
    );
  }

  notify();
};

const normPath = (p: string): string =>
  p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

const pathIsInsideAnyRoot = (path: string): boolean => {
  const p = normPath(path);
  for (const r of roots) {
    const rn = normPath(r);
    if (p === rn || p.startsWith(rn + "/")) return true;
  }
  return false;
};

export const onFileSaved = async (path: string, content: string): Promise<void> => {
  if (roots.length === 0) return;
  if (!pathIsInsideAnyRoot(path)) return;
  const lower = path.toLowerCase();
  if (!(lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".mdx"))) {
    return;
  }
  reindexOne(parseMarkdown(path, content));
  notify();
};

export const onFileDeleted = (path: string): void => {
  if (!files.has(path)) return;
  removeFromIndex(path);
  notify();
};

export const subscribe = (fn: Listener): (() => void) => {
  listeners.add(fn);
  fn(snapshot()); // deliver current snapshot immediately
  return () => {
    listeners.delete(fn);
  };
};

export const getVaultIndex = (): VaultSnapshot => snapshot();

/**
 * Resolve a wikilink target to an absolute file path.
 * Matches case-insensitively against file basenames (without extension).
 */
export const resolveWikilink = (target: string): string | null => {
  return nameToPath.get(target.trim().toLowerCase()) ?? null;
};

/** For tests or the properties panel — parse without touching the index. */
export const parseMarkdownForIndex = parseMarkdown;
