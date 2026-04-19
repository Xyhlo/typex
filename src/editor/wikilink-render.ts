/**
 * Wikilink decoration plugin — scans text for `[[target]]` and adds an inline
 * decoration so the syntax is visually distinct. Broken links (target not in
 * vault index) get a `wikilink--broken` class. Ctrl/Cmd-click follows the link.
 *
 * This is visual-only: it does not alter the document schema. The raw `[[...]]`
 * text remains part of the markdown, so round-tripping through save/export is
 * unaffected.
 */
import { $prose } from "@milkdown/utils";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import type { EditorState } from "@milkdown/prose/state";
import type { Node as PMNode } from "@milkdown/prose/model";
import { resolveWikilink } from "../vault/index";

const WIKILINK_RE = /\[\[([^\]|\n]+?)(?:\|([^\]\n]+))?\]\]/g;

const key = new PluginKey("typex-wikilink-render");

interface PluginOpts {
  onOpen: (target: string, resolvedPath: string | null) => void;
}

const buildDecorations = (doc: PMNode): DecorationSet => {
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    WIKILINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = WIKILINK_RE.exec(node.text)) !== null) {
      const from = pos + m.index;
      const to = from + m[0].length;
      const target = m[1].trim();
      const resolved = resolveWikilink(target);
      const cls = resolved ? "wikilink" : "wikilink wikilink--broken";
      const title = resolved
        ? `Ctrl+Click to open "${target}"`
        : `No document named "${target}" — create it to link`;
      decos.push(
        Decoration.inline(from, to, {
          class: cls,
          "data-wikilink": target,
          title,
        }),
      );
    }
  });
  return DecorationSet.create(doc, decos);
};

export const wikilinkRenderPlugin = (opts: PluginOpts) =>
  $prose(() => {
    return new Plugin({
      key,
      state: {
        init: (_config, state: EditorState) => buildDecorations(state.doc),
        apply: (tr, old) => (tr.docChanged ? buildDecorations(tr.doc) : old),
      },
      props: {
        decorations(state) {
          return this.getState(state);
        },
        handleClickOn(_view, _pos, _node, _nodePos, event) {
          const target = (event.target as HTMLElement | null)?.closest?.(".wikilink");
          if (!target) return false;
          const ev = event as MouseEvent;
          if (!ev.ctrlKey && !ev.metaKey) return false;
          const linkTarget = target.getAttribute("data-wikilink") ?? "";
          if (!linkTarget) return false;
          opts.onOpen(linkTarget, resolveWikilink(linkTarget));
          ev.preventDefault();
          return true;
        },
      },
    });
  });
