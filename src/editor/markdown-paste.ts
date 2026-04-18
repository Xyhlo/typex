/**
 * ProseMirror plugin: treat pasted text as Markdown and parse it through
 * Milkdown's parser so headings, lists, code, etc. render as real nodes
 * instead of literal characters.
 *
 * Additional heuristic: if the pasted text is clearly source code (and not
 * Markdown), we wrap it in a fenced code block with an auto-detected language
 * *before* parsing. That turns a "raw Python paste" into a single
 * syntax-highlighted code block instead of a CommonMark salad of paragraphs
 * and 4-space-indented code.
 *
 * Implementation notes:
 *   - Hooks BOTH `handleDOMEvents.paste` and `handlePaste`. The DOM-event
 *     hook fires before ProseMirror's internal paste pipeline and before any
 *     other plugin's `handlePaste`, which makes us robust to plugin order.
 *   - Must be registered BEFORE `@milkdown/plugin-clipboard` in the editor
 *     chain.
 *   - Language auto-detect uses lowlight (hljs relevance scoring).
 */
import { $prose } from "@milkdown/utils";
import { parserCtx } from "@milkdown/core";
import { Plugin } from "@milkdown/prose/state";
import { Slice } from "@milkdown/prose/model";
import type { Node as PMNode } from "@milkdown/prose/model";
import type { EditorView } from "@milkdown/prose/view";
import type { Ctx } from "@milkdown/ctx";
import { createLowlight, common } from "lowlight";

const lowlight = createLowlight(common);

/** Any of these markers → almost certainly intended as markdown. */
const looksLikeMarkdown = (s: string): boolean => {
  if (/^[ \t]*#{1,6}\s+\S/m.test(s)) return true; // heading
  if (/^[ \t]*>\s/m.test(s)) return true; // blockquote
  if (/^[ \t]*[-*+]\s+\S/m.test(s)) return true; // bullet list
  if (/^[ \t]*\d+\.\s+\S/m.test(s)) return true; // ordered list
  if (/^[ \t]*(```|~~~)/m.test(s)) return true; // already-fenced block
  if (/^[ \t]*\|[^|\n]+\|/m.test(s)) return true; // table row
  if (/\[[^\]\n]+\]\([^)\n]+\)/.test(s)) return true; // link
  if (/!\[[^\]\n]*\]\([^)\n]+\)/.test(s)) return true; // image
  if (/^[ \t]*\[\s*[xX ]\s*\]\s/m.test(s)) return true; // task list
  return false;
};

/** Heuristic: does this multi-line string look like source code? */
const looksLikeCode = (s: string): boolean => {
  const lines = s.split(/\r?\n/);
  if (lines.length < 2) return false;

  // Shebang is a definitive signal
  if (lines[0].startsWith("#!")) return true;

  // HTML / XML top-level
  if (/^\s*<\?(xml|php)\b/.test(lines[0])) return true;
  if (/^\s*<!DOCTYPE/i.test(lines[0])) return true;

  // Count code-like indicators across the paste
  let keywordHits = 0;
  let punctHits = 0;
  const keywordRe =
    /^[ \t]*(function|def|class|import|from|const|let|var|public|private|protected|static|async|await|export|package|namespace|using|include|require|module|struct|interface|enum|fn|trait|impl|if|for|while|switch|try|catch|throw|return|yield|break|continue|new|this|super)\b/;
  const punctRe = /[{};]|=>|->|:=|!=|==|>=|<=/;

  for (const line of lines) {
    if (keywordRe.test(line)) keywordHits++;
    if (punctRe.test(line)) punctHits++;
  }

  if (keywordHits >= 2) return true;
  // Dense punctuation across many lines is another strong signal
  if (punctHits / lines.length > 0.3 && punctHits >= 3) return true;

  return false;
};

/** Detect the most likely language — shebang first, then lowlight auto-detect. */
const detectLanguage = (text: string): string => {
  const firstLine = (text.split(/\r?\n/)[0] ?? "").trim();

  // Shebang fast paths
  if (firstLine.startsWith("#!")) {
    if (/\bpython[0-9.]*\b/.test(firstLine)) return "python";
    if (/\bnode\b/.test(firstLine)) return "javascript";
    if (/\b(ba|z|)sh\b/.test(firstLine)) return "bash";
    if (/\bruby\b/.test(firstLine)) return "ruby";
    if (/\bperl\b/.test(firstLine)) return "perl";
    if (/\bdeno\b/.test(firstLine)) return "typescript";
  }
  if (/^\s*<\?php\b/i.test(firstLine)) return "php";
  if (/^\s*<\?xml\b/i.test(firstLine)) return "xml";

  // lowlight.highlightAuto — hljs relevance scoring picks the winner.
  try {
    const r = lowlight.highlightAuto(text) as unknown as {
      data?: { language?: string };
    };
    const lang = r.data?.language;
    if (lang && typeof lang === "string" && lang !== "plaintext") return lang;
  } catch {
    // fall through to empty string — fence without language info
  }
  return "";
};

/** Code blocks should paste as standalone blocks, not merge into paragraphs. */
const shouldMergeAtBoundary = (node: PMNode | null | undefined): boolean => {
  if (!node?.isTextblock) return false;
  return node.type.name !== "code_block";
};

const insertSlice = (view: EditorView, slice: Slice): void => {
  const tr = view.state.tr.replaceSelection(slice).scrollIntoView();
  view.dispatch(tr);
};

const handle = (ctx: Ctx, view: EditorView, event: ClipboardEvent): boolean => {
  const data = event.clipboardData;
  if (!data) return false;

  let text = data.getData("text/plain");
  if (!text) return false;

  // If it's clearly source code and not markdown, wrap with a fenced
  // block so it parses as a single code_block with a language — that's
  // what unlocks syntax highlighting.
  if (!looksLikeMarkdown(text) && looksLikeCode(text)) {
    const lang = detectLanguage(text);
    const trimmed = text.replace(/\s+$/, "");
    text = "```" + lang + "\n" + trimmed + "\n```";
  }

  try {
    const parser = ctx.get(parserCtx);
    const doc = parser(text);
    if (!doc || doc.content.size === 0) return false;

    const openStart = shouldMergeAtBoundary(doc.firstChild) ? 1 : 0;
    const openEnd = shouldMergeAtBoundary(doc.lastChild) ? 1 : 0;
    const slice = new Slice(doc.content, openStart, openEnd);

    event.preventDefault();
    event.stopPropagation();
    insertSlice(view, slice);
    return true;
  } catch (err) {
    console.error("[typex] markdown paste failed:", err);
    return false;
  }
};

export const markdownPaste = $prose((ctx) => {
  return new Plugin({
    props: {
      handleDOMEvents: {
        paste: (view, event) => handle(ctx, view, event as ClipboardEvent),
      },
      handlePaste: (view, event) => handle(ctx, view, event as ClipboardEvent),
    },
  });
});
