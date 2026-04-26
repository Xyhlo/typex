import { open, save, message, confirm } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile, readDir, exists } from "@tauri-apps/plugin-fs";
import {
  CODE_EXTENSIONS,
  MARKDOWN_EXTENSIONS,
  TEXT_EXTENSIONS,
  resolveFileType,
} from "./file-types";

export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface OpenedFile {
  path: string;
  content: string;
  title: string;
}

const MD_EXT = MARKDOWN_EXTENSIONS;

/** All extensions Pandoc or the native text/code pipeline can open directly. */
const ALL_DOC_EXT = [
  ...MD_EXT,
  ...CODE_EXTENSIONS,
  ...TEXT_EXTENSIONS,
  "docx", "odt", "rtf",
  "html", "htm",
  "epub", "fb2",
  "rst", "adoc", "asciidoc", "textile", "org",
  "wiki", "mediawiki", "muse", "t2t",
  "tex", "latex", "opml", "ipynb", "bib", "man",
];

const basename = (p: string): string => {
  const parts = p.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || p;
};

const dirname = (p: string): string => {
  const normalized = p.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx === -1 ? "" : normalized.slice(0, idx);
};

export const pathJoin = (...parts: string[]): string =>
  parts
    .filter(Boolean)
    .map((p, i) => (i === 0 ? p.replace(/[\\/]+$/, "") : p.replace(/^[\\/]+|[\\/]+$/g, "")))
    .join("/");

export const openAnyDocumentFile = async (
  opts: { allFormats?: boolean } = {},
): Promise<string | null> => {
  if (!isTauri()) return null;
  const allFormats = opts.allFormats ?? true;

  const filters = allFormats
    ? [
        { name: "All openable files", extensions: Array.from(new Set(ALL_DOC_EXT)) },
        { name: "Markdown", extensions: MD_EXT },
        { name: "Code", extensions: CODE_EXTENSIONS },
        { name: "Plain text and data", extensions: TEXT_EXTENSIONS },
        { name: "Microsoft Word", extensions: ["docx"] },
        { name: "OpenDocument", extensions: ["odt"] },
        { name: "Rich Text", extensions: ["rtf"] },
        { name: "HTML", extensions: ["html", "htm"] },
        { name: "EPUB", extensions: ["epub"] },
        { name: "LaTeX", extensions: ["tex", "latex"] },
        { name: "reStructuredText", extensions: ["rst"] },
        { name: "AsciiDoc", extensions: ["adoc", "asciidoc"] },
        { name: "Org mode", extensions: ["org"] },
        { name: "Jupyter Notebook", extensions: ["ipynb"] },
        { name: "All files", extensions: ["*"] },
      ]
    : [
        { name: "Markdown", extensions: MD_EXT },
        { name: "All files", extensions: ["*"] },
      ];

  const selected = await open({ multiple: false, filters });
  if (!selected || Array.isArray(selected)) return null;
  return selected;
};

export const openMarkdownFile = async (): Promise<OpenedFile | null> => {
  if (!isTauri()) return null;
  const selected = await open({
    multiple: false,
    filters: [{ name: "Markdown", extensions: MD_EXT }],
  });
  if (!selected || Array.isArray(selected)) return null;
  const content = await readTextFile(selected);
  return { path: selected, content, title: basename(selected) };
};

export const openFolderDialog = async (): Promise<string | null> => {
  if (!isTauri()) return null;
  const selected = await open({
    multiple: false,
    directory: true,
  });
  if (!selected || Array.isArray(selected)) return null;
  return selected;
};

export const readFile = async (path: string): Promise<string> => {
  return readTextFile(path);
};

export const saveFile = async (path: string, content: string): Promise<void> => {
  await writeTextFile(path, content);
};

export const saveAsDialog = async (
  currentPath: string | null,
  filters = [
    { name: "Markdown", extensions: MD_EXT },
    { name: "All files", extensions: ["*"] },
  ],
): Promise<string | null> => {
  if (!isTauri()) return null;
  const chosen = await save({
    defaultPath: currentPath ?? "Untitled.md",
    filters,
  });
  return chosen ?? null;
};

export const saveAsUntitled = async (
  suggestedName: string,
  defaultFolder?: string | null,
): Promise<string | null> => {
  if (!isTauri()) return null;
  const folder = defaultFolder ?? "";
  const chosen = await save({
    defaultPath: folder ? pathJoin(folder, suggestedName) : suggestedName,
    filters: [{ name: "Markdown", extensions: MD_EXT }],
  });
  return chosen ?? null;
};

export const pathExists = async (path: string): Promise<boolean> => {
  if (!isTauri()) return false;
  try {
    return await exists(path);
  } catch {
    return false;
  }
};

export const pathTitle = (p: string | null, fallback: string): string =>
  p ? basename(p) : fallback;

export { basename, dirname };

export const dialogMessage = async (
  msg: string,
  title = "TypeX",
): Promise<void> => {
  if (!isTauri()) {
    console.info(`[${title}] ${msg}`);
    return;
  }
  await message(msg, { title, kind: "info" });
};

export const dialogConfirm = async (
  msg: string,
  title = "TypeX",
): Promise<boolean> => {
  if (!isTauri()) return window.confirm(msg);
  return confirm(msg, { title, kind: "warning" });
};

export interface DirEntryNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: DirEntryNode[];
}

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".nuxt",
  "dist",
  "build",
  "target",
  ".venv",
  "__pycache__",
  ".DS_Store",
]);

const isVisibleWorkspaceFile = (name: string): boolean => {
  const resolved = resolveFileType(name);
  return resolved.canOpenAsText || resolved.kind === "markdown";
};

/** Read a directory recursively, filtered to folders + TypeX-openable text files. */
export const readWorkspace = async (
  root: string,
  maxDepth = 6,
): Promise<DirEntryNode> => {
  const walk = async (dir: string, depth: number): Promise<DirEntryNode[]> => {
    if (depth > maxDepth) return [];
    let entries: Awaited<ReturnType<typeof readDir>> = [];
    try {
      entries = await readDir(dir);
    } catch {
      return [];
    }
    const nodes: DirEntryNode[] = [];
    for (const e of entries) {
      if (IGNORED_DIRS.has(e.name)) continue;
      const full = pathJoin(dir, e.name);
      if (e.isDirectory) {
        const children = await walk(full, depth + 1);
        // keep folder only if it contains something relevant
        if (children.length) {
          nodes.push({ name: e.name, path: full, isDirectory: true, children });
        } else {
          // include empty folders at the top level too
          if (depth === 0) {
            nodes.push({ name: e.name, path: full, isDirectory: true, children: [] });
          }
        }
      } else if (isVisibleWorkspaceFile(e.name)) {
        nodes.push({ name: e.name, path: full, isDirectory: false });
      }
    }
    nodes.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return nodes;
  };

  const rootName = basename(root);
  const children = await walk(root, 0);
  return { name: rootName, path: root, isDirectory: true, children };
};
