const RECENT_FILES_KEY = "typex:recent-files";
const RECENT_FOLDERS_KEY = "typex:recent-folders";
const MAX_RECENT = 10;

const load = (key: string): string[] => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};

const save = (key: string, list: string[]): void => {
  try {
    localStorage.setItem(key, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch {
    /* ignore quota */
  }
};

export const recentFiles = (): string[] => load(RECENT_FILES_KEY);
export const recentFolders = (): string[] => load(RECENT_FOLDERS_KEY);

export const pushRecentFile = (path: string): void => {
  const list = [path, ...recentFiles().filter((p) => p !== path)];
  save(RECENT_FILES_KEY, list);
};

export const pushRecentFolder = (path: string): void => {
  const list = [path, ...recentFolders().filter((p) => p !== path)];
  save(RECENT_FOLDERS_KEY, list);
};

export const clearRecentFiles = (): void => save(RECENT_FILES_KEY, []);
export const clearRecentFolders = (): void => save(RECENT_FOLDERS_KEY, []);

export const removeRecentFile = (path: string): void =>
  save(RECENT_FILES_KEY, recentFiles().filter((p) => p !== path));
export const removeRecentFolder = (path: string): void =>
  save(RECENT_FOLDERS_KEY, recentFolders().filter((p) => p !== path));
