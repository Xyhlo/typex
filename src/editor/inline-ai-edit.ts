/**
 * Inline AI edit — the "glowing while thinking" animation that replaces a
 * selection (or appends at the cursor) in-place, so Rewrite / Fix / Translate
 * / Continue commands don't need a bottom-docked panel.
 *
 * Flow:
 *   1. `beginInlineAIEdit(view)` snapshots the current selection, clears it,
 *      anchors a pulsing accent-tinted decoration on the (now empty) range,
 *      and returns a handle.
 *   2. `handle.write(chunk)` appends text at the growing edge; the glow
 *      extends to cover the streamed content.
 *   3. `handle.finish()` removes the glow, leaves the streamed text.
 *   4. `handle.abort()` reverts to the original text and removes the glow.
 *
 * Cancel with Ctrl+Z after a finish — the stream's transactions group
 * within ~500 ms so a single undo pops the whole edit. During a stream,
 * Escape is handled by the caller to trigger `abort()`.
 */
import { $prose } from "@milkdown/utils";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import type { EditorView } from "@milkdown/prose/view";

interface Range {
  from: number;
  to: number;
}

interface PluginState {
  range: Range | null;
}

const key = new PluginKey<PluginState>("typex-inline-ai-edit");
const META_SET = "typex-inline-ai-edit:set";
const META_CLEAR = "typex-inline-ai-edit:clear";

const buildCaret = (): HTMLElement => {
  const el = document.createElement("span");
  el.className = "inline-ai-caret";
  el.setAttribute("aria-hidden", "true");
  return el;
};

export const inlineAIEditPlugin = $prose(() =>
  new Plugin<PluginState>({
    key,
    state: {
      init: () => ({ range: null }),
      apply(tr, old) {
        if (tr.getMeta(META_CLEAR)) return { range: null };
        const set = tr.getMeta(META_SET) as Range | undefined;
        if (set) {
          const from = Math.max(0, Math.min(set.from, tr.doc.content.size));
          const to = Math.max(from, Math.min(set.to, tr.doc.content.size));
          return { range: { from, to } };
        }
        if (!old.range) return old;
        // Map through any doc changes the host made concurrently (e.g. an
        // external write landed mid-stream). Usually our own inserts are the
        // only source of mutation here, but be defensive.
        if (tr.docChanged) {
          return {
            range: {
              from: tr.mapping.map(old.range.from),
              to: tr.mapping.map(old.range.to),
            },
          };
        }
        return old;
      },
    },
    props: {
      decorations(state) {
        const r = this.getState(state)?.range;
        if (!r) return DecorationSet.empty;
        const decos: Decoration[] = [];
        if (r.to > r.from) {
          decos.push(
            Decoration.inline(r.from, r.to, { class: "inline-ai-glow" }),
          );
        }
        decos.push(
          Decoration.widget(r.to, buildCaret, {
            side: 1,
          } as Record<string, unknown>),
        );
        return DecorationSet.create(state.doc, decos);
      },
    },
  }),
);

export interface InlineEditHandle {
  /** Original text that was replaced (empty for pure-insert at cursor). */
  readonly originalText: string;
  /** Append chunk at the growing edge. */
  write(chunk: string): void;
  /** Mark complete — keeps streamed result in place, removes glow. */
  finish(): void;
  /** Revert to original text and remove glow. */
  abort(): void;
  /** True once finish() or abort() has fired. */
  readonly ended: boolean;
}

/**
 * Begin an inline AI edit. If there's a selection, the selected text is
 * cleared and its original content is exposed as `originalText`; if there's
 * no selection, the edit anchors at the cursor and streams are inserted.
 */
export const beginInlineAIEdit = (view: EditorView): InlineEditHandle => {
  const { from, to } = view.state.selection;
  const originalText =
    from === to ? "" : view.state.doc.textBetween(from, to, "\n", "\n");

  let tr = view.state.tr;
  if (from !== to) tr = tr.delete(from, to);
  tr = tr.setMeta(META_SET, { from, to: from });
  try {
    view.dispatch(tr);
  } catch {
    /* view destroyed */
  }

  let currentEnd = from;
  let ended = false;

  return {
    originalText,
    get ended() {
      return ended;
    },
    write(chunk: string) {
      if (ended || !chunk) return;
      try {
        const t = view.state.tr
          .insertText(chunk, currentEnd)
          .setMeta(META_SET, { from, to: currentEnd + chunk.length });
        view.dispatch(t);
        currentEnd += chunk.length;
      } catch {
        ended = true;
      }
    },
    finish() {
      if (ended) return;
      ended = true;
      try {
        view.dispatch(view.state.tr.setMeta(META_CLEAR, true));
      } catch {
        /* view destroyed */
      }
    },
    abort() {
      if (ended) return;
      ended = true;
      try {
        let t = view.state.tr.delete(from, currentEnd);
        if (originalText) t = t.insertText(originalText, from);
        t = t.setMeta(META_CLEAR, true);
        view.dispatch(t);
      } catch {
        /* view destroyed */
      }
    },
  };
};
