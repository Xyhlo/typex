import { allCommands, filterCommands, runCommand, type Command } from "../commands";

export interface PaletteController {
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const createPalette = (): PaletteController => {
  const root = document.getElementById("palette")!;
  const input = document.getElementById("palette-input") as HTMLInputElement;
  const list = document.getElementById("palette-list")!;
  const backdrop = root.querySelector(".palette__backdrop")!;

  let selectedIdx = 0;
  let results: Command[] = [];

  const render = (): void => {
    list.replaceChildren();
    if (results.length === 0) {
      const empty = document.createElement("div");
      empty.className = "palette__empty";
      empty.textContent = "No matching commands";
      list.appendChild(empty);
      return;
    }
    results.forEach((cmd, i) => {
      const item = document.createElement("div");
      item.className = "palette-item" + (i === selectedIdx ? " is-selected" : "");
      item.dataset.id = cmd.id;

      const icon = document.createElement("span");
      icon.className = "palette-item__icon";
      icon.innerHTML = cmd.icon ?? defaultIcon();
      item.appendChild(icon);

      const label = document.createElement("span");
      label.className = "palette-item__label";
      const title = document.createElement("span");
      title.className = "palette-item__title";
      title.textContent = cmd.title;
      label.appendChild(title);
      if (cmd.subtitle) {
        const sub = document.createElement("span");
        sub.className = "palette-item__subtitle";
        sub.textContent = cmd.subtitle;
        label.appendChild(sub);
      }
      item.appendChild(label);

      if (cmd.shortcut && cmd.shortcut.length) {
        const sc = document.createElement("span");
        sc.className = "palette-item__shortcut";
        for (const k of cmd.shortcut) {
          const kbd = document.createElement("kbd");
          kbd.textContent = k;
          sc.appendChild(kbd);
        }
        item.appendChild(sc);
      }

      item.addEventListener("mousemove", () => {
        if (selectedIdx !== i) {
          selectedIdx = i;
          render();
        }
      });
      item.addEventListener("click", () => execute(cmd));

      list.appendChild(item);
    });

    const selected = list.children[selectedIdx] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: "nearest" });
  };

  const update = (): void => {
    results = input.value.trim() ? filterCommands(input.value) : allCommands();
    selectedIdx = 0;
    render();
  };

  const execute = async (cmd: Command): Promise<void> => {
    close();
    await runCommand(cmd.id);
  };

  const open = (): void => {
    root.hidden = false;
    input.value = "";
    input.focus();
    update();
  };

  const close = (): void => {
    root.classList.add("is-closing");
    window.setTimeout(() => {
      root.classList.remove("is-closing");
      root.hidden = true;
    }, 160);
  };

  const toggle = (): void => {
    if (root.hidden) open();
    else close();
  };

  input.addEventListener("input", update);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (results.length) {
        selectedIdx = (selectedIdx + 1) % results.length;
        render();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length) {
        selectedIdx = (selectedIdx - 1 + results.length) % results.length;
        render();
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = results[selectedIdx];
      if (cmd) execute(cmd);
    }
  });

  backdrop.addEventListener("click", close);

  return { open, close, toggle };
};

const defaultIcon = (): string =>
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 6 2 12 8 18"/><polyline points="16 6 22 12 16 18"/></svg>';
