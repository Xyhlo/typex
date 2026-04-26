export type DocumentKind = "markdown" | "converted" | "code" | "text";

export type ResolvedFileKind =
  | "markdown"
  | "code"
  | "text"
  | "document"
  | "image"
  | "binary";

export interface ResolvedFileType {
  ext: string;
  kind: ResolvedFileKind;
  language: string | null;
  label: string;
  canOpenAsText: boolean;
}

const MARKDOWN_EXT = new Set(["md", "markdown", "mdx"]);

const TEXT_EXT = new Set([
  "txt",
  "text",
  "log",
  "csv",
  "tsv",
  "ini",
  "cfg",
  "conf",
  "config",
  "env",
  "properties",
  "editorconfig",
  "gitignore",
  "gitattributes",
  "dockerignore",
  "npmrc",
  "yarnrc",
]);

const IMAGE_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "ico",
  "tif",
  "tiff",
  "avif",
]);

const DOCUMENT_EXT = new Set([
  "docx",
  "odt",
  "rtf",
  "epub",
  "fb2",
  "rst",
  "adoc",
  "asciidoc",
  "textile",
  "org",
  "wiki",
  "mediawiki",
  "muse",
  "t2t",
  "tex",
  "latex",
  "opml",
  "ipynb",
  "bib",
  "man",
]);

const BINARY_EXT = new Set([
  "exe",
  "dll",
  "msi",
  "appx",
  "bin",
  "dat",
  "db",
  "sqlite",
  "sqlite3",
  "zip",
  "7z",
  "rar",
  "tar",
  "gz",
  "bz2",
  "xz",
  "pdf",
  "mp3",
  "mp4",
  "mov",
  "avi",
  "mkv",
  "wav",
  "flac",
  "ttf",
  "otf",
  "woff",
  "woff2",
]);

const LANGUAGE_BY_EXT: Record<string, string> = {
  adoc: "asciidoc",
  applescript: "applescript",
  bat: "batch",
  bib: "bibtex",
  c: "c",
  cc: "cpp",
  clj: "clojure",
  cljs: "clojure",
  cmake: "cmake",
  cmd: "batch",
  coffee: "coffeescript",
  cpp: "cpp",
  cs: "csharp",
  css: "css",
  dart: "dart",
  diff: "diff",
  dockerfile: "dockerfile",
  ex: "elixir",
  exs: "elixir",
  fs: "fsharp",
  fsx: "fsharp",
  go: "go",
  gql: "graphql",
  graphql: "graphql",
  groovy: "groovy",
  h: "c",
  hpp: "cpp",
  hs: "haskell",
  html: "xml",
  htm: "xml",
  java: "java",
  jl: "julia",
  js: "javascript",
  json: "json",
  jsonc: "json",
  jsx: "javascript",
  kt: "kotlin",
  kts: "kotlin",
  less: "less",
  lua: "lua",
  m: "objectivec",
  mm: "objectivec",
  nix: "nix",
  patch: "diff",
  php: "php",
  pl: "perl",
  pm: "perl",
  proto: "protobuf",
  ps1: "powershell",
  psm1: "powershell",
  py: "python",
  r: "r",
  rb: "ruby",
  rs: "rust",
  sass: "scss",
  scala: "scala",
  scss: "scss",
  sh: "bash",
  sql: "sql",
  svelte: "xml",
  swift: "swift",
  toml: "toml",
  ts: "typescript",
  tsx: "typescript",
  vue: "xml",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zig: "zig",
  zsh: "bash",
};

const SPECIAL_FILENAMES: Record<string, { language: string; label: string }> = {
  dockerfile: { language: "dockerfile", label: "Dockerfile" },
  makefile: { language: "makefile", label: "Makefile" },
  rakefile: { language: "ruby", label: "Ruby" },
  gemfile: { language: "ruby", label: "Ruby" },
};

const LABEL_BY_LANGUAGE: Record<string, string> = {
  asciidoc: "AsciiDoc",
  bash: "Shell",
  batch: "Batch",
  bibtex: "BibTeX",
  c: "C",
  clojure: "Clojure",
  cmake: "CMake",
  coffeescript: "CoffeeScript",
  cpp: "C++",
  csharp: "C#",
  css: "CSS",
  dart: "Dart",
  diff: "Diff",
  dockerfile: "Dockerfile",
  elixir: "Elixir",
  fsharp: "F#",
  go: "Go",
  graphql: "GraphQL",
  groovy: "Groovy",
  haskell: "Haskell",
  java: "Java",
  javascript: "JavaScript",
  json: "JSON",
  julia: "Julia",
  kotlin: "Kotlin",
  less: "Less",
  lua: "Lua",
  makefile: "Makefile",
  nix: "Nix",
  objectivec: "Objective-C",
  perl: "Perl",
  php: "PHP",
  powershell: "PowerShell",
  protobuf: "Protocol Buffers",
  python: "Python",
  r: "R",
  ruby: "Ruby",
  rust: "Rust",
  scala: "Scala",
  scss: "SCSS",
  sql: "SQL",
  swift: "Swift",
  toml: "TOML",
  typescript: "TypeScript",
  xml: "XML/HTML",
  yaml: "YAML",
  zig: "Zig",
};

export const CODE_EXTENSIONS = Object.keys(LANGUAGE_BY_EXT).sort();
export const TEXT_EXTENSIONS = Array.from(TEXT_EXT).sort();
export const MARKDOWN_EXTENSIONS = Array.from(MARKDOWN_EXT).sort();

export const pathExt = (path: string): string => {
  const name = basename(path);
  const idx = name.lastIndexOf(".");
  if (idx <= 0 || idx === name.length - 1) return "";
  return name.slice(idx + 1).toLowerCase();
};

export const basename = (path: string): string => {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
};

export const isMarkdownExtension = (ext: string): boolean =>
  MARKDOWN_EXT.has(ext.toLowerCase());

export const isPlainTextDocument = (kind: DocumentKind): boolean =>
  kind === "code" || kind === "text";

export const isMarkdownDocument = (kind: DocumentKind): boolean =>
  kind === "markdown" || kind === "converted";

export const languageLabel = (language: string | null): string =>
  language ? LABEL_BY_LANGUAGE[language] ?? language : "Plain text";

export const resolveFileType = (path: string): ResolvedFileType => {
  const name = basename(path);
  const lowerName = name.toLowerCase();
  const ext = pathExt(path);

  const special = SPECIAL_FILENAMES[lowerName];
  if (special) {
    return {
      ext,
      kind: "code",
      language: special.language,
      label: special.label,
      canOpenAsText: true,
    };
  }

  if (MARKDOWN_EXT.has(ext)) {
    return {
      ext,
      kind: "markdown",
      language: "markdown",
      label: ext === "mdx" ? "MDX" : "Markdown",
      canOpenAsText: true,
    };
  }

  if (DOCUMENT_EXT.has(ext)) {
    return {
      ext,
      kind: "document",
      language: null,
      label: "Document",
      canOpenAsText: false,
    };
  }

  const language = LANGUAGE_BY_EXT[ext];
  if (language) {
    return {
      ext,
      kind: "code",
      language,
      label: languageLabel(language),
      canOpenAsText: true,
    };
  }

  if (TEXT_EXT.has(ext) || ext === "") {
    return {
      ext,
      kind: "text",
      language: null,
      label: "Plain text",
      canOpenAsText: true,
    };
  }

  if (IMAGE_EXT.has(ext)) {
    return {
      ext,
      kind: "image",
      language: null,
      label: "Image",
      canOpenAsText: false,
    };
  }

  if (BINARY_EXT.has(ext)) {
    return {
      ext,
      kind: "binary",
      language: null,
      label: "Binary",
      canOpenAsText: false,
    };
  }

  return {
    ext,
    kind: "text",
    language: null,
    label: "Plain text",
    canOpenAsText: true,
  };
};
