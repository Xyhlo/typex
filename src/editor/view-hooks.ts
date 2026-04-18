/**
 * Editor view hooks — runs on every doc/selection change to keep two view
 * modes in sync with the current caret:
 *
 *   - Typewriter: smooth-scroll the editor-host so the caret stays vertically
 *     centered while the user types.
 *   - Focus mode: tag the top-level block that contains the caret with
 *     `is-current`; CSS fades every sibling. Replaces the old :focus-within
 *     selector (which didn't match contenteditable descendants reliably).
 *
 * Reads `<#app>` data attributes (`data-typewriter`, `data-focus-mode`) so the
 * same toggles that flip CSS flip behavior here too.
 */
import { $prose } from "@milkdown/utils";
import { Plugin } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";

const TYPEWRITER_DEAD_ZONE = 24;

const appEl = (): HTMLElement | null => document.getElementById("app");

const syncTypewriter = (view: EditorView): void => {
  if (appEl()?.dataset.typewriter !== "true") return;
  const scroller = document.querySelector<HTMLElement>(".editor-host");
  if (!scroller) return;
  const coords = view.coordsAtPos(view.state.selection.head);
  const rect = scroller.getBoundingClientRect();
  const target = rect.top + rect.height / 2;
  const delta = coords.top - target;
  if (Math.abs(delta) > TYPEWRITER_DEAD_ZONE) {
    scroller.scrollBy({ top: delta, behavior: "smooth" });
  }
};

const clearCurrent = (root: HTMLElement): void => {
  root.querySelectorAll(":scope > .is-current").forEach((el) => {
    el.classList.remove("is-current");
  });
};

const syncFocusMode = (view: EditorView): void => {
  const root = view.dom as HTMLElement;
  if (appEl()?.dataset.focusMode !== "true") {
    clearCurrent(root);
    return;
  }
  const head = view.state.selection.head;
  let target: HTMLElement | null = null;
  try {
    const at = view.domAtPos(head);
    target = at.node.nodeType === 1
      ? (at.node as HTMLElement)
      : at.node.parentElement;
    while (target && target.parentElement !== root) {
      target = target.parentElement;
    }
  } catch {
    // Position may not resolve during mid-transaction states; bail silently.
  }
  root.querySelectorAll<HTMLElement>(":scope > .is-current").forEach((el) => {
    if (el !== target) el.classList.remove("is-current");
  });
  if (target) target.classList.add("is-current");
};

export const viewHooks = $prose(() => {
  return new Plugin({
    view(view) {
      // Initial sync so modes that are on at boot take effect immediately.
      queueMicrotask(() => {
        syncFocusMode(view);
        syncTypewriter(view);
      });

      // External trigger so toggling focus / typewriter from outside (menu,
      // shortcut) can re-run the sync without requiring a real PM transaction.
      const rerun = (): void => {
        syncFocusMode(view);
        syncTypewriter(view);
      };
      document.addEventListener("typex:view-sync", rerun);

      return {
        update(updated, prevState) {
          if (!updated.state.selection.eq(prevState.selection)) {
            syncTypewriter(updated);
          }
          syncFocusMode(updated);
        },
        destroy() {
          document.removeEventListener("typex:view-sync", rerun);
        },
      };
    },
  });
});
