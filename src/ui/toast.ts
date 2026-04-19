/**
 * Toast notifications — two flavors:
 *
 *   toast("message")            → fire-and-forget text banner, auto-hides.
 *   progressToast("Converting…") → persistent banner with a ring spinner,
 *                                  returns a handle for .update / .success
 *                                  / .error / .close.
 *
 * Only one toast is visible at a time; a new toast replaces any existing
 * one. The progress handle becomes inert after .success / .error / .close.
 */

const el = (): HTMLElement | null => document.getElementById("toast");

let fadeTimer: number | null = null;

const clearFade = (): void => {
  if (fadeTimer != null) {
    window.clearTimeout(fadeTimer);
    fadeTimer = null;
  }
};

const show = (html: string, className: string): void => {
  const node = el();
  if (!node) return;
  node.className = className;
  node.innerHTML = html;
  node.hidden = false;
};

const hide = (): void => {
  const node = el();
  if (!node) return;
  node.hidden = true;
};

const escapeHtml = (s: string): string =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

/** Lightweight one-shot toast — auto-hides after `durationMs`. */
export const toast = (message: string, durationMs = 2200): void => {
  clearFade();
  show(escapeHtml(message), "toast");
  fadeTimer = window.setTimeout(hide, durationMs);
};

export interface ProgressToastHandle {
  /** Update the progress message without dismissing the spinner. */
  update: (message: string) => void;
  /** Transform into a green success toast and auto-hide after 1.5s. */
  success: (message: string) => void;
  /** Transform into a red error toast and hold until dismissed. */
  error: (message: string, durationMs?: number) => void;
  /** Dismiss immediately. */
  close: () => void;
}

/** Persistent toast with a ring spinner. Returns a handle to resolve it. */
export const progressToast = (message: string): ProgressToastHandle => {
  clearFade();
  const render = (cls: string, body: string): void => {
    show(
      `<span class="tx-spinner" aria-hidden="true"></span><span class="toast__label">${body}</span>`,
      cls,
    );
  };
  render("toast toast--progress", escapeHtml(message));

  let resolved = false;

  return {
    update(msg) {
      if (resolved) return;
      const label = el()?.querySelector<HTMLElement>(".toast__label");
      if (label) label.textContent = msg;
    },
    success(msg) {
      if (resolved) return;
      resolved = true;
      show(
        `<span class="toast__label">${escapeHtml(msg)}</span>`,
        "toast toast--success",
      );
      fadeTimer = window.setTimeout(hide, 1600);
    },
    error(msg, durationMs = 4000) {
      if (resolved) return;
      resolved = true;
      show(
        `<span class="toast__label">${escapeHtml(msg)}</span>`,
        "toast toast--error",
      );
      fadeTimer = window.setTimeout(hide, durationMs);
    },
    close() {
      if (resolved) return;
      resolved = true;
      hide();
    },
  };
};
