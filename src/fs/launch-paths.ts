import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "./files";

/**
 * File paths this process was launched with (via "Open with TypeX",
 * drag-drop onto the .exe, or `typex file.md` on the command line).
 */
export const launchPaths = async (): Promise<string[]> => {
  if (!isTauri()) return [];
  try {
    return await invoke<string[]>("launch_paths");
  } catch {
    return [];
  }
};

/**
 * Listen for file paths forwarded from a second launch (when the user
 * double-clicks another file with TypeX already running). The single-instance
 * plugin consolidates launches and emits `typex://open-paths` with the args
 * of the would-be second instance.
 */
export const onLaunchPaths = async (
  handler: (paths: string[]) => void,
): Promise<() => void> => {
  if (!isTauri()) return () => {};
  return listen<string[]>("typex://open-paths", (event) => {
    handler(event.payload ?? []);
  });
};
