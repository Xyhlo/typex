/**
 * Frontend file-watcher bridge.
 *
 * The Rust side emits debounced `typex://fs-changed` events whenever a file
 * under the watched workspace changes externally. We:
 *
 *   1. Suppress events that match a recent own-write (TypeX itself wrote the
 *      file — the watcher fires but we already know about it).
 *   2. For changes on a path that's currently open in a tab, detect whether
 *      the disk content diverges from what TypeX last loaded/saved — and
 *      surface an "external change" prompt when it does.
 *   3. Delegate follow-on actions (git status refresh, vault reindex, gutter
 *      refresh) to registered listeners.
 *
 * Wave 3 of the Phase 2 roadmap.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauri } from "./files";

export interface FsEvent {
  path: string;
  kind: string;
}

type Listener = (evt: FsEvent) => void;
const listeners = new Set<Listener>();

/**
 * Record of own-writes — path → expires-at timestamp (ms).
 *
 * TTL is generous (5 s) because Pandoc exports can take a second or two on
 * large documents. Call sites should mark both before *and* after the write
 * so the watcher debounce + OS event latency land inside the window.
 */
const OWN_WRITE_WINDOW_MS = 5000;
const ownWrites = new Map<string, number>();

let unlisten: UnlistenFn | null = null;
let watchedRoots: string[] = [];

const normalizePath = (p: string): string =>
  // On Windows, notify emits paths with backslashes; app code uses either.
  // Normalise to forward-slash for equality checks.
  p.replace(/\\/g, "/").toLowerCase();

const isInBlackout = (path: string): boolean => {
  const now = Date.now();
  const key = normalizePath(path);
  // Clean up expired entries opportunistically.
  for (const [k, exp] of ownWrites) {
    if (exp < now) ownWrites.delete(k);
  }
  const exp = ownWrites.get(key);
  return exp !== undefined && exp > now;
};

/** Mark a path as "TypeX just wrote this" — suppresses the next fs event. */
export const markOwnWrite = (path: string): void => {
  ownWrites.set(normalizePath(path), Date.now() + OWN_WRITE_WINDOW_MS);
};

export const onFsEvent = (fn: Listener): (() => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

const sameRootList = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

const ensureTauriListener = async (): Promise<void> => {
  if (unlisten) return;
  unlisten = await listen<FsEvent>("typex://fs-changed", (e) => {
    const payload = e.payload;
    if (isInBlackout(payload.path)) return;
    for (const fn of listeners) {
      try {
        fn(payload);
      } catch (err) {
        console.error("[fs-watcher] listener threw:", err);
      }
    }
  });
};

/**
 * @deprecated use `watchRoots` — retained for call sites that still pass a
 * single path, but internally routes to the multi-root command.
 */
export const watchWorkspace = async (path: string | null): Promise<void> => {
  await watchRoots(path ? [path] : []);
};

export const watchRoots = async (paths: string[]): Promise<void> => {
  if (!isTauri()) return;
  if (sameRootList(watchedRoots, paths)) return;
  await ensureTauriListener();
  try {
    if (paths.length === 0) {
      await invoke("fs_unwatch");
    } else {
      await invoke("fs_watch_roots", { paths });
    }
    watchedRoots = paths.slice();
  } catch (err) {
    console.error("[fs-watcher] watch/unwatch failed:", err);
  }
};

/** Teardown — call on app shutdown (not strictly required, process exits). */
export const stopWatching = async (): Promise<void> => {
  if (unlisten) {
    unlisten();
    unlisten = null;
  }
  if (isTauri()) {
    try {
      await invoke("fs_unwatch");
    } catch {
      /* ignore */
    }
  }
  watchedRoots = [];
};
