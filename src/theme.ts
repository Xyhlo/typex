import { getState, setState, type Theme } from "./state";

const STORAGE_KEY = "typex:theme";

export const initTheme = (): void => {
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
  const preferred: Theme =
    stored ??
    (window.matchMedia?.("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark");
  applyTheme(preferred, { persist: false, animate: false });
};

export const toggleTheme = (): void => {
  const next: Theme = getState().theme === "dark" ? "light" : "dark";
  applyTheme(next);
};

export const applyTheme = (
  theme: Theme,
  opts: { persist?: boolean; animate?: boolean } = {},
): void => {
  const { persist = true, animate = true } = opts;
  const root = document.documentElement;

  if (animate) {
    root.setAttribute("data-theme-transition", "");
    window.setTimeout(() => root.removeAttribute("data-theme-transition"), 260);
  }

  root.setAttribute("data-theme", theme);
  setState({ theme });
  if (persist) localStorage.setItem(STORAGE_KEY, theme);
};
