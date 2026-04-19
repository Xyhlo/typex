/**
 * External-flash decoration plugin — briefly highlights the top-level blocks
 * that just changed because of an external write (AI stream, formatter, etc.).
 *
 * The plugin exposes a `flashRange(from, to)` transaction meta so `main.ts`
 * (the external-change handler) can tell the plugin what to highlight after
 * a scroll-preserving apply. Decorations auto-expire via a timer that
 * dispatches a clearing transaction.
 */
import { $prose } from "@milkdown/utils";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import type { EditorView } from "@milkdown/prose/view";

const key = new PluginKey<DecorationSet>("typex-external-flash");
const META_FLASH = "typex-external-flash:set";
const META_CLEAR = "typex-external-flash:clear";
const META_CARET = "typex-external-flash:caret";

const FLASH_DURATION_MS = 1500;

let flashSeq = 0;

/**
 * Per-view timer registry so an editor destroy cleanly cancels all pending
 * flash-clear timers. Without this, `setTimeout`s accumulate across tab
 * churn and keep firing on destroyed views — the try/catch swallows the
 * dispatch, but the handles leak.
 */
const viewTimers = new WeakMap<EditorView, Set<number>>();

const registerTimer = (view: EditorView, id: number): void => {
  let set = viewTimers.get(view);
  if (!set) {
    set = new Set();
    viewTimers.set(view, set);
  }
  set.add(id);
};

const unregisterTimer = (view: EditorView, id: number): void => {
  viewTimers.get(view)?.delete(id);
};

const cancelAllViewTimers = (view: EditorView): void => {
  const set = viewTimers.get(view);
  if (!set) return;
  for (const id of set) window.clearTimeout(id);
  set.clear();
  viewTimers.delete(view);
};

export interface FlashOpts {
  /** Inclusive start position in ProseMirror doc coordinates. */
  from: number;
  /** Exclusive end position. */
  to: number;
}

/**
 * Show a blinking caret at `pos` until `hideExternalCaret` is called. Used
 * during stream-apply so the user sees a marker at the growing edge.
 */
export const showExternalCaret = (view: EditorView, pos: number): void => {
  const safe = Math.max(0, Math.min(pos, view.state.doc.content.size));
  try {
    view.dispatch(view.state.tr.setMeta(META_CARET, safe));
  } catch {
    /* view destroyed */
  }
};

export const hideExternalCaret = (view: EditorView): void => {
  try {
    view.dispatch(view.state.tr.setMeta(META_CARET, null));
  } catch {
    /* view destroyed */
  }
};

/** Imperatively trigger a flash on the editor view. */
export const flashExternalRange = (view: EditorView, opts: FlashOpts): void => {
  const { doc } = view.state;
  const from = Math.max(0, Math.min(opts.from, doc.content.size));
  const to = Math.max(from, Math.min(opts.to, doc.content.size));
  if (to <= from) return;
  const id = ++flashSeq;
  view.dispatch(view.state.tr.setMeta(META_FLASH, { from, to, id }));
  const timer = window.setTimeout(() => {
    unregisterTimer(view, timer);
    try {
      view.dispatch(view.state.tr.setMeta(META_CLEAR, id));
    } catch {
      /* view destroyed */
    }
  }, FLASH_DURATION_MS);
  registerTimer(view, timer);
};

export const externalFlashPlugin = $prose(() =>
  new Plugin<DecorationSet>({
    key,
    state: {
      init: (_config, state) => DecorationSet.empty.add(state.doc, []),
      apply(tr, old) {
        // Map existing decorations through the doc change so they track content.
        let next = old.map(tr.mapping, tr.doc);
        const set = tr.getMeta(META_FLASH) as
          | (FlashOpts & { id: number })
          | undefined;
        if (set) {
          const { from, to, id } = set;
          next = next.add(tr.doc, [
            Decoration.inline(
              from,
              to,
              { class: "external-flash" },
              // Attach the flash id as a decoration spec so we can match on
              // clear. Spec is opaque to the renderer.
              { flashId: id } as Record<string, unknown>,
            ),
          ]);
        }
        const clearId = tr.getMeta(META_CLEAR) as number | undefined;
        if (clearId != null) {
          const survivors = next.find().filter((d) => {
            const spec = (d as unknown as { spec?: { flashId?: number; caret?: boolean } }).spec;
            return spec?.flashId !== clearId;
          });
          next = DecorationSet.create(tr.doc, survivors);
        }
        // Caret handling — at most one caret at a time.
        const caretMeta = tr.getMeta(META_CARET);
        if (caretMeta !== undefined) {
          const survivors = next.find().filter((d) => {
            const spec = (d as unknown as { spec?: { caret?: boolean } }).spec;
            return !spec?.caret;
          });
          if (caretMeta === null) {
            next = DecorationSet.create(tr.doc, survivors);
          } else {
            const pos = caretMeta as number;
            const widget = Decoration.widget(
              pos,
              () => {
                const el = document.createElement("span");
                el.className = "stream-caret";
                return el;
              },
              { caret: true, side: 1 } as Record<string, unknown>,
            );
            next = DecorationSet.create(tr.doc, [...survivors, widget]);
          }
        }
        return next;
      },
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
    view(editorView) {
      return {
        destroy() {
          cancelAllViewTimers(editorView);
        },
      };
    },
  }),
);
