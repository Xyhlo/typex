/**
 * Streaming detector — classifies external writes as either a discrete save
 * or a live stream (AI writing into the file, formatter-on-save chains,
 * rsync-style sync tools).
 *
 * A path is considered "streaming" if a watcher event for it has arrived
 * within `STREAM_WINDOW_MS`. The window slides with every event, so a steady
 * flow keeps the flag on; the flag drops once the file goes quiet.
 *
 * Subscribers get notified when a path enters or leaves the streaming state
 * so the UI can toggle pulse animations and badges.
 */

const STREAM_WINDOW_MS = 500;
const CHECK_INTERVAL_MS = 250;

const lastEventAt = new Map<string, number>();
const streamingPaths = new Set<string>();
type Listener = (paths: ReadonlySet<string>) => void;
const listeners = new Set<Listener>();

const normKey = (p: string): string =>
  p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

/** Record an fs event for `path`. Call from the fs-watcher bridge. */
export const recordEvent = (path: string): void => {
  const key = normKey(path);
  lastEventAt.set(key, Date.now());
  if (!streamingPaths.has(key)) {
    streamingPaths.add(key);
    notify();
  }
};

/** Is this specific path currently being streamed to? */
export const isStreaming = (path: string): boolean => {
  const key = normKey(path);
  const t = lastEventAt.get(key);
  if (t === undefined) return false;
  return Date.now() - t < STREAM_WINDOW_MS;
};

/** Is any path currently streaming? Used for a global indicator. */
export const anyStreaming = (): boolean => streamingPaths.size > 0;

export const subscribeStreaming = (fn: Listener): (() => void) => {
  listeners.add(fn);
  fn(new Set(streamingPaths));
  return () => {
    listeners.delete(fn);
  };
};

const notify = (): void => {
  // Hand out a defensive copy so a buggy listener can't mutate our live set.
  const snap = new Set(streamingPaths);
  for (const fn of listeners) {
    try {
      fn(snap);
    } catch (err) {
      console.error("[streaming] listener threw:", err);
    }
  }
};

/** Drop stale entries from both maps so long sessions don't leak. */
const LAST_EVENT_RETAIN_MS = 60_000; // keep an hour's worth at most — cheap

let sweeperStarted = false;
export const startStreamingSweeper = (): void => {
  if (sweeperStarted) return;
  sweeperStarted = true;
  window.setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const key of [...streamingPaths]) {
      const t = lastEventAt.get(key);
      if (t === undefined || now - t >= STREAM_WINDOW_MS) {
        streamingPaths.delete(key);
        changed = true;
      }
    }
    // Evict last-event timestamps older than the retain window so the map
    // doesn't grow unbounded in a long session.
    for (const [key, t] of lastEventAt) {
      if (now - t >= LAST_EVENT_RETAIN_MS) lastEventAt.delete(key);
    }
    if (changed) notify();
  }, CHECK_INTERVAL_MS);
};

/** For tests / cleanup. */
export const resetStreaming = (): void => {
  lastEventAt.clear();
  streamingPaths.clear();
  notify();
};
