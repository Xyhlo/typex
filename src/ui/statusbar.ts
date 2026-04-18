import { getState, subscribe, isDirty } from "../state";

const WPM = 238; // typical reading speed

export const initStatusbar = (): void => {
  const pathEl = document.getElementById("status-path")!;
  const dirtyEl = document.getElementById("status-dirty")!;
  const wordsEl = document.getElementById("status-words")!;
  const charsEl = document.getElementById("status-chars")!;
  const readEl = document.getElementById("status-reading")!;

  const render = (): void => {
    const s = getState();
    const active = s.tabs.find((t) => t.id === s.activeTabId);
    if (!active) {
      pathEl.textContent = "No document";
      dirtyEl.hidden = true;
      wordsEl.textContent = "0 words";
      charsEl.textContent = "0 chars";
      readEl.textContent = "0 min";
      return;
    }

    pathEl.textContent = active.path ?? active.title;
    dirtyEl.hidden = !isDirty(active);

    const content = active.content;
    const words = content.match(/\b[\p{L}\p{N}'’-]+\b/gu)?.length ?? 0;
    const chars = content.length;
    const minutes = Math.max(1, Math.round(words / WPM));
    wordsEl.textContent = `${words.toLocaleString()} words`;
    charsEl.textContent = `${chars.toLocaleString()} chars`;
    readEl.textContent = `${minutes} min`;
  };

  subscribe(render);
  render();
};
