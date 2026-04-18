import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "../fs/files";

export const initWindowControls = async (): Promise<void> => {
  const minBtn = document.getElementById("win-min");
  const maxBtn = document.getElementById("win-max");
  const closeBtn = document.getElementById("win-close");
  const wrap = document.getElementById("window-controls");

  if (!isTauri()) {
    if (wrap) wrap.style.display = "none";
    return;
  }

  const win = getCurrentWindow();
  minBtn?.addEventListener("click", () => win.minimize());
  maxBtn?.addEventListener("click", () => win.toggleMaximize());
  closeBtn?.addEventListener("click", () => win.close());
};
