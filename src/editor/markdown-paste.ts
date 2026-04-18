/**
 * ProseMirror plugin: treat pasted text as Markdown and parse it through
 * Milkdown's parser so headings, lists, code, etc. render as real nodes
 * instead of literal characters.
 *
 * Implementation notes:
 *   - We hook BOTH `handleDOMEvents.paste` and `handlePaste`. The DOM-event
 *     hook fires before ProseMirror's internal paste pipeline (and before any
 *     other plugin's handlePaste), which makes us robust to plugin ordering
 *     and to whether other plugins register handlePaste.
 *   - The plugin must be registered BEFORE `@milkdown/plugin-clipboard` in the
 *     editor chain so our DOM hook beats the clipboard plugin's handling.
 *   - We always parse clipboard text as Markdown — that's the contract of a
 *     Markdown editor. If the parser fails or produces nothing, we return
 *     false and let the default path run (which will at least insert the raw
 *     text).
 */
import { $prose } from "@milkdown/utils";
import { parserCtx } from "@milkdown/core";
import { Plugin } from "@milkdown/prose/state";
import { Slice } from "@milkdown/prose/model";
import type { EditorView } from "@milkdown/prose/view";
import type { Ctx } from "@milkdown/ctx";

const parseMarkdownToSlice = (ctx: Ctx, text: string): Slice | null => {
  if (!text) return null;
  try {
    const parser = ctx.get(parserCtx);
    if (typeof parser !== "function") return null;
    const doc = parser(text);
    if (!doc || doc.content.size === 0) return null;
    const openStart = doc.firstChild?.isTextblock ? 1 : 0;
    const openEnd = doc.lastChild?.isTextblock ? 1 : 0;
    return new Slice(doc.content, openStart, openEnd);
  } catch (err) {
    console.error("[typex] markdown paste parse failed:", err);
    return null;
  }
};

const insertSlice = (view: EditorView, slice: Slice): void => {
  const tr = view.state.tr.replaceSelection(slice).scrollIntoView();
  view.dispatch(tr);
};

const handle = (ctx: Ctx, view: EditorView, event: ClipboardEvent): boolean => {
  const data = event.clipboardData;
  if (!data) return false;

  // Prefer text/plain — in a Markdown editor, the user's intent when pasting
  // text is "this is Markdown." If the clipboard has only HTML (e.g. a
  // screenshot copy), bail out and let the default path handle it.
  const text = data.getData("text/plain");
  if (!text) return false;

  const slice = parseMarkdownToSlice(ctx, text);
  if (!slice) return false;

  event.preventDefault();
  event.stopPropagation();
  insertSlice(view, slice);
  return true;
};

export const markdownPaste = $prose((ctx) => {
  return new Plugin({
    props: {
      handleDOMEvents: {
        paste: (view, event) => handle(ctx, view, event as ClipboardEvent),
      },
      // Redundant safety-net in case the DOM-event hook is bypassed by a
      // synthetic paste call or a plugin that calls view.someProp('handlePaste').
      handlePaste: (view, event) => handle(ctx, view, event as ClipboardEvent),
    },
  });
});
