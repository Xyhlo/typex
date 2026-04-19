/**
 * CLI subprocess bridge — front-end wrapper around Rust's `cli_exec_stream`.
 *
 * The Rust side spawns a binary, pipes optional stdin, and emits one
 * `typex://cli-chunk` per line of stdout/stderr, then one `typex://cli-done`
 * with the exit code. We buffer chunks into an AsyncIterable so callers can
 * `for await` them, and expose a `cancel()` that kills the process.
 *
 * Used by CLI AI adapters (Claude Code, Codex, paseo) and nothing else.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { isTauri } from '../fs/files';

interface CliChunkPayload {
  id: string;
  stream: 'stdout' | 'stderr';
  text: string;
}

interface CliDonePayload {
  id: string;
  exit_code: number;
  error: string | null;
}

export interface CliStreamLine {
  stream: 'stdout' | 'stderr';
  text: string;
}

export interface CliStreamResult {
  /** Lines as they arrive. Ends when the process exits. */
  lines: AsyncIterable<CliStreamLine>;
  /** Resolves with exit info. -1 on spawn failure, -2 on user cancel. */
  done: Promise<{ exitCode: number; error: string | null }>;
  /** Kill the process. Idempotent. */
  cancel: () => Promise<void>;
}

let idCounter = 0;
const nextId = (): string => `cli-${Date.now()}-${++idCounter}`;

/** Resolve a binary name to an absolute path on PATH. `null` if not found. */
export const cliWhich = async (name: string): Promise<string | null> => {
  if (!isTauri()) return null;
  try {
    const p = await invoke<string | null>('cli_which', { name });
    return p ?? null;
  } catch {
    return null;
  }
};

/** Probe `<binary> <arg>` and return the first stdout (or stderr) line. */
export const cliVersion = async (
  binary: string,
  arg?: string,
): Promise<string | null> => {
  if (!isTauri()) return null;
  try {
    const out = await invoke<string | null>('cli_version', { binary, arg: arg ?? null });
    return out ?? null;
  } catch {
    return null;
  }
};

/**
 * Spawn a subprocess and stream its stdout/stderr line-by-line.
 *
 * The caller typically:
 *   1. Starts iterating `result.lines` to consume output.
 *   2. Awaits `result.done` for the exit code.
 *   3. Wires `opts.signal` to cancel on user abort.
 */
export const cliExecStream = (opts: {
  binary: string;
  args: string[];
  stdin?: string;
  signal?: AbortSignal;
}): CliStreamResult => {
  if (!isTauri()) {
    const err = new Error('cliExecStream requires Tauri runtime');
    const lines: AsyncIterable<CliStreamLine> = {
      // eslint-disable-next-line require-yield
      async *[Symbol.asyncIterator]() {
        throw err;
      },
    };
    return {
      lines,
      done: Promise.reject(err),
      cancel: async () => {
        /* nothing to cancel */
      },
    };
  }

  const id = nextId();
  const queue: CliStreamLine[] = [];
  let pending: ((v: IteratorResult<CliStreamLine>) => void) | null = null;
  let finished = false;
  let unlistenChunk: UnlistenFn | null = null;
  let unlistenDone: UnlistenFn | null = null;
  let cancelled = false;

  let doneResolver!: (v: { exitCode: number; error: string | null }) => void;
  const donePromise = new Promise<{ exitCode: number; error: string | null }>(
    (r) => {
      doneResolver = r;
    },
  );

  const cleanup = (): void => {
    if (unlistenChunk) {
      try {
        unlistenChunk();
      } catch {
        /* ignore */
      }
      unlistenChunk = null;
    }
    if (unlistenDone) {
      try {
        unlistenDone();
      } catch {
        /* ignore */
      }
      unlistenDone = null;
    }
  };

  const push = (line: CliStreamLine): void => {
    if (pending) {
      const resolve = pending;
      pending = null;
      resolve({ value: line, done: false });
      return;
    }
    queue.push(line);
  };

  const finish = (info: { exitCode: number; error: string | null }): void => {
    if (finished) return;
    finished = true;
    doneResolver(info);
    if (pending) {
      const resolve = pending;
      pending = null;
      resolve({ value: undefined as unknown as CliStreamLine, done: true });
    }
    cleanup();
  };

  // Wire listeners BEFORE spawning so we never miss an early chunk.
  const ready = (async (): Promise<void> => {
    unlistenChunk = await listen<CliChunkPayload>('typex://cli-chunk', (e) => {
      if (e.payload.id !== id) return;
      push({ stream: e.payload.stream, text: e.payload.text });
    });
    unlistenDone = await listen<CliDonePayload>('typex://cli-done', (e) => {
      if (e.payload.id !== id) return;
      finish({ exitCode: e.payload.exit_code, error: e.payload.error });
    });
  })();

  ready
    .then(() =>
      invoke('cli_exec_stream', {
        id,
        binary: opts.binary,
        args: opts.args,
        stdin: opts.stdin ?? null,
      }),
    )
    .catch((err: unknown) => {
      finish({
        exitCode: -1,
        error: `spawn failed: ${String(err).slice(0, 240)}`,
      });
    });

  const cancel = async (): Promise<void> => {
    if (cancelled) return;
    cancelled = true;
    try {
      await invoke('cli_cancel', { id });
    } catch {
      /* Rust-side registry may already be gone if the process exited. */
    }
  };

  if (opts.signal) {
    if (opts.signal.aborted) void cancel();
    else opts.signal.addEventListener('abort', () => void cancel(), { once: true });
  }

  const lines: AsyncIterable<CliStreamLine> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<CliStreamLine>> {
          if (queue.length > 0) {
            const value = queue.shift() as CliStreamLine;
            return Promise.resolve({ value, done: false });
          }
          if (finished) {
            return Promise.resolve({
              value: undefined as unknown as CliStreamLine,
              done: true,
            });
          }
          return new Promise<IteratorResult<CliStreamLine>>((resolve) => {
            pending = resolve;
          });
        },
        async return(): Promise<IteratorResult<CliStreamLine>> {
          await cancel();
          cleanup();
          return { value: undefined as unknown as CliStreamLine, done: true };
        },
      };
    },
  };

  return { lines, done: donePromise, cancel };
};
