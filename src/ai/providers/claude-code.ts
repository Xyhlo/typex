/**
 * Claude Code CLI adapter.
 *
 * If the user has the `claude` binary on PATH and is authenticated (via
 * `claude login` or ANTHROPIC_API_KEY in their environment), we can spawn it
 * in non-interactive mode and stream the output.
 *
 * Invocation:   claude --print --model <id>   (prompt piped on stdin)
 *
 * --print runs once and exits with the response on stdout. Auth is handled
 * entirely by the CLI itself — TypeX never sees the key.
 */
import type {
  AIProvider,
  AIProviderStatus,
  AIModel,
  AICompleteOpts,
  AIChunk,
} from '../provider';
import { cliWhich, cliVersion, cliExecStream } from '../cli-runner';

const BINARY = 'claude';

/** Model set Claude Code supports. Kept in sync with the anthropic adapter. */
const MODELS: AIModel[] = [
  { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', note: 'Most capable · slower' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', note: 'Balanced default' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', note: 'Fastest' },
];

const buildPrompt = (opts: AICompleteOpts): string => {
  const parts: string[] = [];
  if (opts.system) parts.push(opts.system);
  if (opts.context) parts.push(`Context:\n${opts.context}`);
  parts.push(opts.prompt);
  return parts.join('\n\n');
};

export const claudeCodeProvider: AIProvider = {
  id: 'claude-code',
  label: 'Claude Code CLI',
  vendor: 'anthropic',
  kind: 'cli-spawn',
  // Claude Code is an interactive coding agent — it introduces itself and
  // offers help rather than continuing prose. Don't use it for ghost text.
  supportsAutocomplete: false,

  async detect(): Promise<AIProviderStatus> {
    const path = await cliWhich(BINARY);
    if (!path) {
      return { available: false, detail: 'claude binary not on PATH' };
    }
    const version = await cliVersion(path, '--version');
    if (!version) {
      return { available: false, detail: 'claude --version did not respond' };
    }
    return {
      available: true,
      detail: version,
      modelCount: MODELS.length,
    };
  },

  async listModels(): Promise<AIModel[]> {
    return MODELS.slice();
  },

  async *complete(opts: AICompleteOpts): AsyncIterable<AIChunk> {
    const path = await cliWhich(BINARY);
    if (!path) {
      yield {
        text: '',
        done: true,
        meta: { error: 'Claude Code CLI not found on PATH.' },
      };
      return;
    }

    const run = cliExecStream({
      binary: path,
      args: ['--print', '--model', opts.model],
      stdin: buildPrompt(opts),
      signal: opts.signal,
    });

    const stderrLog: string[] = [];
    try {
      for await (const line of run.lines) {
        if (line.stream === 'stderr') {
          // Keep a tail of stderr in case we need to surface it on non-zero exit.
          stderrLog.push(line.text);
          if (stderrLog.length > 20) stderrLog.shift();
          continue;
        }
        if (line.text) yield { text: line.text, done: false };
      }
      const info = await run.done;
      if (info.exitCode === 0) {
        yield { text: '', done: true };
        return;
      }
      if (info.exitCode === -2) {
        yield { text: '', done: true, meta: { cancelled: true } };
        return;
      }
      const tail = stderrLog.join('').trim().slice(-200);
      yield {
        text: '',
        done: true,
        meta: {
          error: `claude exited ${info.exitCode}${tail ? ` — ${tail}` : ''}`,
        },
      };
    } catch (err) {
      if (opts.signal?.aborted) {
        yield { text: '', done: true, meta: { cancelled: true } };
        return;
      }
      yield {
        text: '',
        done: true,
        meta: { error: `claude stream failed: ${String(err).slice(0, 160)}` },
      };
    }
  },
};
