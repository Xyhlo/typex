/**
 * Ghost-text plugin — renders inline AI suggestions as dim text after the
 * cursor, accepted with Tab, dismissed with Esc, and automatically cleared on
 * any doc change that isn't our own. The controller in `src/ai/autocomplete.ts`
 * drives what shows up; this file is purely rendering + keymap.
 *
 * Phase 4 Wave 3.
 */
import { $prose } from "@milkdown/utils";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import type { EditorView } from "@milkdown/prose/view";

interface GhostPluginState {
  text: string;
  /** Document position where the ghost is anchored. */
  from: number;
  decorations: DecorationSet;
}

export interface GhostInfo {
  text: string;
  from: number;
}

const key = new PluginKey<GhostPluginState>("typex-ghost-text");
const META_SET = "typex-ghost-text:set";
const META_CLEAR = "typex-ghost-text:clear";
const META_ACCEPT = "typex-ghost-text:accept";

/** Listeners fired on user-initiated doc changes — the autocomplete debounce hook. */
type TickListener = (view: EditorView) => void;
const tickListeners = new Set<TickListener>();

export const onGhostTick = (fn: TickListener): (() => void) => {
  tickListeners.add(fn);
  return () => {
    tickListeners.delete(fn);
  };
};

const fireTick = (view: EditorView): void => {
  for (const fn of tickListeners) {
    try {
      fn(view);
    } catch (err) {
      console.error("[ghost-text] tick listener threw:", err);
    }
  }
};

const buildWidget = (text: string): HTMLElement => {
  const el = document.createElement("span");
  el.className = "typex-ghost-text";
  el.setAttribute("aria-hidden", "true");
  // Use textContent so any angle brackets / markup in the suggestion render
  // literally. A nested span keeps ProseMirror happy with whitespace.
  const inner = document.createElement("span");
  inner.textContent = text;
  el.appendChild(inner);
  return el;
};

/** Current ghost state, if any. */
export const getGhost = (view: EditorView): GhostInfo | null => {
  const s = key.getState(view.state);
  if (!s || !s.text) return null;
  return { text: s.text, from: s.from };
};

/** Install or replace the ghost suggestion at `from`. */
export const setGhost = (view: EditorView, text: string, from: number): void => {
  if (!text) {
    clearGhost(view);
    return;
  }
  try {
    view.dispatch(view.state.tr.setMeta(META_SET, { text, from }));
  } catch {
    /* view destroyed */
  }
};

/** Dismiss the ghost without accepting. */
export const clearGhost = (view: EditorView): void => {
  try {
    view.dispatch(view.state.tr.setMeta(META_CLEAR, true));
  } catch {
    /* view destroyed */
  }
};

/** Accept the ghost — inserts its text at `from` and clears the decoration. */
export const acceptGhost = (view: EditorView): boolean => {
  const g = getGhost(view);
  if (!g) return false;
  try {
    const tr = view.state.tr.insertText(g.text, g.from).setMeta(META_ACCEPT, true);
    view.dispatch(tr);
    view.focus();
    return true;
  } catch {
    return false;
  }
};

export const ghostTextPlugin = $prose(() =>
  new Plugin<GhostPluginState>({
    key,
    state: {
      init: () => ({ text: "", from: 0, decorations: DecorationSet.empty }),
      apply(tr, old) {
        const setMeta = tr.getMeta(META_SET) as GhostInfo | undefined;
        if (setMeta) {
          const from = Math.min(
            Math.max(0, setMeta.from),
            tr.doc.content.size,
          );
          const widget = Decoration.widget(
            from,
            () => buildWidget(setMeta.text),
            { side: 1 } as Record<string, unknown>,
          );
          return {
            text: setMeta.text,
            from,
            decorations: DecorationSet.create(tr.doc, [widget]),
          };
        }

        if (tr.getMeta(META_CLEAR) || tr.getMeta(META_ACCEPT)) {
          return { text: "", from: 0, decorations: DecorationSet.empty };
        }

        if (!old.text) return old;

        // Any real doc change that wasn't ours invalidates the ghost.
        if (tr.docChanged) {
          return { text: "", from: 0, decorations: DecorationSet.empty };
        }
        // Cursor moved away from the anchor? Drop the ghost too.
        if (tr.selectionSet && tr.selection.head !== old.from) {
          return { text: "", from: 0, decorations: DecorationSet.empty };
        }
        return {
          text: old.text,
          from: tr.mapping.map(old.from),
          decorations: old.decorations.map(tr.mapping, tr.doc),
        };
      },
    },
    props: {
      decorations(state) {
        return this.getState(state)?.decorations;
      },
      handleKeyDown(view, event) {
        const s = key.getState(view.state);
        if (!s || !s.text) return false;
        if (event.key === "Tab" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          acceptGhost(view);
          return true;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          clearGhost(view);
          return true;
        }
        return false;
      },
    },
    view(editorView) {
      let lastDoc = editorView.state.doc;
      return {
        update(view) {
          if (view.state.doc === lastDoc) return;
          lastDoc = view.state.doc;
          // Only fire tick listeners when the editor has focus — programmatic
          // writes (stream-apply, replaceAll on load) shouldn't trigger a
          // ghost request.
          if (!view.hasFocus()) return;
          fireTick(view);
        },
      };
    },
  }),
);
