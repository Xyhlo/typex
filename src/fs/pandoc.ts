import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./files";

export interface PandocFormat {
  /** File extension without the dot. */
  ext: string;
  /** Name passed to pandoc with -f / -t. */
  pandocName: string;
  /** User-facing label. */
  label: string;
  /** Display in dialog "Save as type" lists. */
  group?: string;
}

/**
 * Formats TypeX can READ via pandoc (beyond the native markdown/txt paths).
 * Order here is the display order in menus / file pickers.
 */
export const IMPORT_FORMATS: PandocFormat[] = [
  { ext: "md",       pandocName: "gfm",        label: "Markdown",            group: "Markdown" },
  { ext: "markdown", pandocName: "gfm",        label: "Markdown",            group: "Markdown" },
  { ext: "mdx",      pandocName: "markdown",   label: "MDX",                 group: "Markdown" },
  { ext: "txt",      pandocName: "markdown",   label: "Plain text",          group: "Markdown" },

  { ext: "docx",     pandocName: "docx",       label: "Microsoft Word",      group: "Office" },
  { ext: "odt",      pandocName: "odt",        label: "OpenDocument Text",   group: "Office" },
  { ext: "rtf",      pandocName: "rtf",        label: "Rich Text Format",    group: "Office" },

  { ext: "html",     pandocName: "html",       label: "HTML",                group: "Web" },
  { ext: "htm",      pandocName: "html",       label: "HTML",                group: "Web" },
  { ext: "epub",     pandocName: "epub",       label: "EPUB",                group: "Ebooks" },
  { ext: "fb2",      pandocName: "fb2",        label: "FictionBook",         group: "Ebooks" },

  { ext: "rst",      pandocName: "rst",        label: "reStructuredText",    group: "Markup" },
  { ext: "adoc",     pandocName: "asciidoc",   label: "AsciiDoc",            group: "Markup" },
  { ext: "asciidoc", pandocName: "asciidoc",   label: "AsciiDoc",            group: "Markup" },
  { ext: "textile",  pandocName: "textile",    label: "Textile",             group: "Markup" },
  { ext: "org",      pandocName: "org",        label: "Org mode",            group: "Markup" },
  { ext: "wiki",     pandocName: "mediawiki",  label: "MediaWiki",           group: "Markup" },
  { ext: "mediawiki",pandocName: "mediawiki",  label: "MediaWiki",           group: "Markup" },
  { ext: "muse",     pandocName: "muse",       label: "Emacs Muse",          group: "Markup" },
  { ext: "t2t",      pandocName: "t2t",        label: "txt2tags",            group: "Markup" },

  { ext: "tex",      pandocName: "latex",      label: "LaTeX",               group: "Technical" },
  { ext: "latex",    pandocName: "latex",      label: "LaTeX",               group: "Technical" },
  { ext: "opml",     pandocName: "opml",       label: "OPML outline",        group: "Technical" },
  { ext: "ipynb",    pandocName: "ipynb",      label: "Jupyter Notebook",    group: "Technical" },
  { ext: "bib",      pandocName: "bibtex",     label: "BibTeX",              group: "Technical" },
  { ext: "man",      pandocName: "man",        label: "Unix man page",       group: "Technical" },
];

/**
 * Formats TypeX can WRITE via pandoc. We omit input-only formats and any
 * format that requires an external engine (e.g., PDF via latex) — PDF export
 * uses the webview's print pipeline instead.
 */
export const EXPORT_FORMATS: PandocFormat[] = [
  { ext: "md",       pandocName: "gfm",         label: "Markdown (GFM)",         group: "Markdown" },
  { ext: "md",       pandocName: "commonmark_x",label: "Markdown (CommonMark+)", group: "Markdown" },

  { ext: "docx",     pandocName: "docx",        label: "Microsoft Word (.docx)", group: "Office" },
  { ext: "odt",      pandocName: "odt",         label: "OpenDocument (.odt)",    group: "Office" },
  { ext: "rtf",      pandocName: "rtf",         label: "Rich Text (.rtf)",       group: "Office" },

  { ext: "html",     pandocName: "html5",       label: "HTML (Pandoc)",          group: "Web" },
  { ext: "epub",     pandocName: "epub3",       label: "EPUB 3",                 group: "Ebooks" },
  { ext: "fb2",      pandocName: "fb2",         label: "FictionBook",            group: "Ebooks" },

  { ext: "rst",      pandocName: "rst",         label: "reStructuredText",       group: "Markup" },
  { ext: "adoc",     pandocName: "asciidoc",    label: "AsciiDoc",               group: "Markup" },
  { ext: "textile",  pandocName: "textile",     label: "Textile",                group: "Markup" },
  { ext: "org",      pandocName: "org",         label: "Org mode",               group: "Markup" },
  { ext: "wiki",     pandocName: "mediawiki",   label: "MediaWiki",              group: "Markup" },

  { ext: "tex",      pandocName: "latex",       label: "LaTeX (.tex)",           group: "Technical" },
  { ext: "json",     pandocName: "json",        label: "Pandoc JSON AST",        group: "Technical" },
  { ext: "man",      pandocName: "man",         label: "Unix man page",          group: "Technical" },
];

export const NATIVE_MARKDOWN_EXT = new Set(["md", "markdown", "mdx", "txt"]);

export const extOf = (path: string): string => {
  const idx = path.lastIndexOf(".");
  if (idx < 0 || idx === path.length - 1) return "";
  return path.slice(idx + 1).toLowerCase();
};

export const isMarkdownExt = (ext: string): boolean =>
  NATIVE_MARKDOWN_EXT.has(ext.toLowerCase());

export const getImportFormat = (ext: string): PandocFormat | undefined =>
  IMPORT_FORMATS.find((f) => f.ext === ext.toLowerCase());

export const getExportFormatByExt = (ext: string): PandocFormat | undefined =>
  EXPORT_FORMATS.find((f) => f.ext === ext.toLowerCase());

/** Dialog filter suitable for the native open dialog. */
export const importDialogFilters = () => {
  const all = Array.from(new Set(IMPORT_FORMATS.map((f) => f.ext)));
  return [
    { name: "Markdown", extensions: ["md", "markdown", "mdx", "txt"] },
    { name: "All supported formats", extensions: all },
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
  ];
};

// ---------------- Backend bridge ----------------

let cachedVersion: string | null | undefined;

export const pandocVersion = async (refresh = false): Promise<string | null> => {
  if (!isTauri()) return null;
  if (!refresh && cachedVersion !== undefined) return cachedVersion;
  try {
    const v = await invoke<string | null>("pandoc_version");
    cachedVersion = v ?? null;
    return cachedVersion;
  } catch {
    cachedVersion = null;
    return null;
  }
};

export const pandocAvailable = async (): Promise<boolean> => {
  return (await pandocVersion()) != null;
};

export const pandocImport = async (
  inputPath: string,
  fromFormat?: string,
): Promise<string> => {
  if (!isTauri()) throw new Error("Pandoc requires the desktop app");
  return invoke<string>("pandoc_convert_from_file", {
    inputPath,
    fromFormat: fromFormat ?? null,
  });
};

export const pandocExport = async (
  markdown: string,
  toFormat: string,
  outputPath: string,
): Promise<void> => {
  if (!isTauri()) throw new Error("Pandoc requires the desktop app");
  await invoke<void>("pandoc_convert_to_file", {
    markdown,
    toFormat,
    outputPath,
  });
};
