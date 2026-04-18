/**
 * Syntax highlighting for code blocks.
 *
 * Uses `lowlight` (highlight.js's AST-only variant) to tokenize code-block
 * text, then paints ProseMirror decorations with `hljs-*` classes. This
 * avoids touching the contenteditable DOM directly — critical for keeping
 * ProseMirror's internal model in sync during edits.
 *
 * Theme integration: `src/styles/themes.css` already maps `--hl-*` tokens
 * for both Obsidian Ink and Ivory Paper, and `src/styles/editor.css` binds
 * those to `.hljs-keyword`, `.hljs-string`, etc. So once this plugin emits
 * the classes, the colors just appear.
 */
import { $prose } from "@milkdown/utils";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import type { Node as PMNode } from "@milkdown/prose/model";
import { createLowlight, common } from "lowlight";
import type { Root, RootContent } from "hast";

const lowlight = createLowlight(common);

/** Registered language names + a few common aliases. */
const aliasMap: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  jsx: "javascript",
  tsx: "typescript",
  py: "python",
  rb: "ruby",
  sh: "bash",
  shell: "bash",
  yml: "yaml",
  md: "markdown",
  rs: "rust",
  kt: "kotlin",
  cs: "csharp",
  "c++": "cpp",
  "c#": "csharp",
  html: "xml",
  svg: "xml",
};

const resolveLang = (name: string): string | null => {
  if (!name) return null;
  const lower = name.toLowerCase();
  const resolved = aliasMap[lower] ?? lower;
  return lowlight.registered(resolved) ? resolved : null;
};

const pluginKey = new PluginKey("typex-syntax-highlight");

const walkHast = (
  children: RootContent[],
  classes: string[],
  from: number,
  decos: Decoration[],
): number => {
  let offset = from;
  for (const child of children) {
    if (child.type === "text") {
      const len = child.value.length;
      if (classes.length > 0 && len > 0) {
        decos.push(
          Decoration.inline(offset, offset + len, {
            class: classes.join(" "),
          }),
        );
      }
      offset += len;
    } else if (child.type === "element") {
      const nextClasses = [...classes];
      const cls = child.properties?.className;
      if (Array.isArray(cls)) {
        for (const c of cls) if (typeof c === "string") nextClasses.push(c);
      } else if (typeof cls === "string") {
        nextClasses.push(cls);
      }
      offset = walkHast(child.children, nextClasses, offset, decos);
    }
  }
  return offset;
};

const buildDecorations = (doc: PMNode): DecorationSet => {
  const decos: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== "code_block" && node.type.name !== "fence") return;
    const language = node.attrs.language ?? node.attrs.lang ?? "";
    const resolved = resolveLang(String(language));
    if (!resolved) return;

    const text = node.textContent;
    if (!text) return;

    let tree: Root;
    try {
      tree = lowlight.highlight(resolved, text) as Root;
    } catch {
      return;
    }

    // Content starts at pos + 1 (inside the code_block node).
    walkHast(tree.children, [], pos + 1, decos);
  });

  return decos.length > 0
    ? DecorationSet.create(doc, decos)
    : DecorationSet.empty;
};

export const syntaxHighlight = $prose(() => {
  return new Plugin({
    key: pluginKey,
    state: {
      init(_config, instance) {
        return buildDecorations(instance.doc);
      },
      apply(tr, old) {
        if (!tr.docChanged) return old;
        return buildDecorations(tr.doc);
      },
    },
    props: {
      decorations(state) {
        return pluginKey.getState(state) as DecorationSet | undefined;
      },
    },
  });
});
