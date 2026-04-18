let timer: number | null = null;

export const toast = (message: string, durationMs = 2200): void => {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    el.hidden = true;
  }, durationMs);
};
