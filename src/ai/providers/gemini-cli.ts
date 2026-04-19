/**
 * Google Gemini CLI adapter.
 *
 * Binary name: `gemini` (installed via `npm i -g @google/gemini-cli`).
 * Authentication is handled by the CLI itself — either OAuth via
 * `gemini auth` or a `GEMINI_API_KEY` in the environment.
 *
 * Invocation:   gemini --model <id> --prompt <prompt-on-stdin>
 *
 * Like the other CLI agents, Gemini's CLI is chat-tuned; we opt it out of
 * autocomplete.
 */
import type {
  AIProvider,
  AIProviderStatus,
  AIModel,
  AICompleteOpts,
  AIChunk,
} from '../provider';
import { cliWhich, cliVersion, cliExecStream } from '../cli-runner';

const BINARY = 'gemini';

/** Same list as the Gemini API adapter. */
const MODELS: AIModel[] = [
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', note: 'Most capable' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', note: 'Balanced default' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', note: 'Fastest' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', note: 'Previous generation' },
];

const buildPrompt = (opts: AICompleteOpts): string => {
  const parts: string[] = [];
  if (opts.system) parts.push(opts.system);
  if (opts.context) parts.push(`Context:\n${opts.context}`);
  parts.push(opts.prompt);
  return parts.join('\n\n');
};

export const geminiCliProvider: AIProvider = {
  id: 'gemini-cli',
  label: 'Gemini CLI',
  vendor: 'google',
  kind: 'cli-spawn',
  supportsAutocomplete: false,

  async detect(): Promise<AIProviderStatus> {
    const path = await cliWhich(BINARY);
    if (!path) {
      return { available: false, detail: 'gemini binary not on PATH' };
    }
    const version = await cliVersion(path, '--version');
    if (!version) {
      return { available: false, detail: 'gemini --version did not respond' };
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
        meta: { error: 'Gemini CLI not found on PATH.' },
      };
      return;
    }

    const run = cliExecStream({
      binary: path,
      // `-p -` reads the prompt from stdin (avoids shell quoting on user content).
      args: ['--model', opts.model, '-p', '-'],
      stdin: buildPrompt(opts),
      signal: opts.signal,
    });

    const stderrLog: string[] = [];
    try {
      for await (const line of run.lines) {
        if (line.stream === 'stderr') {
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
          error: `gemini exited ${info.exitCode}${tail ? ` — ${tail}` : ''}`,
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
        meta: { error: `gemini stream failed: ${String(err).slice(0, 160)}` },
      };
    }
  },
};
