/**
 * OpenAI Codex CLI adapter.
 *
 * Installed via `npm i -g @openai/codex` (binary name: `codex`). The CLI
 * authenticates with `codex login` (interactive OAuth) or an `OPENAI_API_KEY`
 * in the environment; TypeX never sees the key.
 *
 * Invocation for a one-shot run:   codex exec --model <id> <prompt>
 *
 * Codex is a coding *agent* — it's chat-tuned and will happily respond
 * conversationally, so we mark it `supportsAutocomplete: false`.
 */
import type {
  AIProvider,
  AIProviderStatus,
  AIModel,
  AICompleteOpts,
  AIChunk,
} from '../provider';
import { cliWhich, cliVersion, cliExecStream } from '../cli-runner';

const BINARY = 'codex';

/** Keep this roughly in sync with `openai.ts`. */
const MODELS: AIModel[] = [
  { id: 'gpt-5', label: 'GPT-5', note: 'Most capable · slower' },
  { id: 'gpt-5-mini', label: 'GPT-5 mini', note: 'Balanced default' },
  { id: 'gpt-4.1', label: 'GPT-4.1', note: 'Previous generation' },
  { id: 'o3-mini', label: 'o3-mini', note: 'Reasoning-first' },
];

const buildPrompt = (opts: AICompleteOpts): string => {
  const parts: string[] = [];
  if (opts.system) parts.push(opts.system);
  if (opts.context) parts.push(`Context:\n${opts.context}`);
  parts.push(opts.prompt);
  return parts.join('\n\n');
};

export const codexProvider: AIProvider = {
  id: 'codex',
  label: 'Codex CLI',
  vendor: 'openai',
  kind: 'cli-spawn',
  supportsAutocomplete: false,

  async detect(): Promise<AIProviderStatus> {
    const path = await cliWhich(BINARY);
    if (!path) {
      return { available: false, detail: 'codex binary not on PATH' };
    }
    const version = await cliVersion(path, '--version');
    if (!version) {
      return { available: false, detail: 'codex --version did not respond' };
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
        meta: { error: 'Codex CLI not found on PATH.' },
      };
      return;
    }

    // `codex exec` runs a single prompt non-interactively. Pass the prompt on
    // stdin to avoid quoting issues with arbitrary user content.
    const run = cliExecStream({
      binary: path,
      args: ['exec', '--model', opts.model, '-'],
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
          error: `codex exited ${info.exitCode}${tail ? ` — ${tail}` : ''}`,
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
        meta: { error: `codex stream failed: ${String(err).slice(0, 160)}` },
      };
    }
  },
};
