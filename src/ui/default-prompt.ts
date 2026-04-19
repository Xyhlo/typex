/**
 * First-run "make TypeX the default" banner.
 *
 * Behavior:
 *   - Not shown if the user has clicked "Don't ask again" (x) or taken any
 *     terminal action ("Set for this type", "Manage all types…") in a
 *     previous session. That preference persists across launches.
 *   - "Not now" dismisses for the current session only; we ask again next
 *     launch.
 *   - When TypeX was opened with a file (from Explorer), the prompt asks
 *     about THAT file's extension specifically. Otherwise it defaults to
 *     asking about Markdown (`.md`).
 */
import { openDefaultAppsSettings } from "../fs/default-apps";

const STORAGE_KEY = "typex:default-prompt";

type Answer = "never" | null;

const loadAnswer = (): Answer => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "never" ? "never" : null;
  } catch {
    return null;
  }
};

const saveAnswer = (answer: Answer): void => {
  try {
    if (answer) localStorage.setItem(STORAGE_KEY, answer);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore quota */
  }
};

export interface DefaultPromptOpts {
  /**
   * Extension the user just opened, without the dot. When present, the
   * prompt asks about this specific type ("Use TypeX for .docx files?")
   * and the "Set for this type" button deep-links to the per-ext settings
   * page on Windows 11 22H2+. When absent, asks about Markdown in general.
   */
  ext?: string;
}

/**
 * Show the banner if appropriate. Resolves immediately; the user's
 * click resolution is handled inside (each button wires its own handler).
 */
export const maybeShowDefaultPrompt = (opts: DefaultPromptOpts = {}): void => {
  if (loadAnswer() === "never") return;

  const root = document.getElementById("default-prompt");
  if (!root) return;

  const titleEl = document.getElementById("default-prompt-title");
  const thisBtn = document.getElementById("default-prompt-this");
  const allBtn = document.getElementById("default-prompt-all");
  const laterBtn = document.getElementById("default-prompt-later");
  const dismissBtn = document.getElementById("default-prompt-dismiss");
  if (!titleEl || !thisBtn || !allBtn || !laterBtn || !dismissBtn) return;

  const ext = opts.ext?.toLowerCase();
  const friendly = ext ? `.${ext}` : "Markdown";
  titleEl.textContent = ext
    ? `Use TypeX for ${friendly} files by default?`
    : `Make TypeX your default Markdown editor?`;

  // Hide the per-extension button if we have no specific ext to target —
  // "Set for this type" is meaningless without an extension. The
  // "Manage all types…" button still works.
  (thisBtn as HTMLElement).hidden = !ext;

  const close = (permanent: boolean): void => {
    root.classList.remove("is-open");
    window.setTimeout(() => {
      root.hidden = true;
    }, 320);
    if (permanent) saveAnswer("never");
  };

  // Replace nodes to drop any stale listeners from a previous invocation.
  const rewire = (id: string, handler: () => void): void => {
    const old = document.getElementById(id)!;
    const fresh = old.cloneNode(true) as HTMLElement;
    old.replaceWith(fresh);
    fresh.addEventListener("click", handler);
  };

  rewire("default-prompt-this", () => {
    void openDefaultAppsSettings(ext);
    close(true);
  });
  rewire("default-prompt-all", () => {
    void openDefaultAppsSettings();
    close(true);
  });
  rewire("default-prompt-later", () => {
    // Session-only dismissal: don't persist anything.
    close(false);
  });
  rewire("default-prompt-dismiss", () => {
    close(true);
  });

  root.hidden = false;
  // Trigger the slide-in on the next frame so the CSS transition runs.
  requestAnimationFrame(() => {
    root.classList.add("is-open");
  });
};
