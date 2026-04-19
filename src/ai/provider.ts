/**
 * AI provider abstraction — one interface, three backend shapes:
 *
 *   - HTTP-local    (Ollama on localhost)
 *   - HTTP-remote   (Anthropic / OpenAI / Gemini; key-authenticated)
 *   - CLI spawn     (Claude Code, Codex, OpenCode, Pi, paseo — Wave 2)
 *
 * All adapters yield streaming `AIChunk`s through an async iterator so the
 * UI can render tokens as they land. Cancellation via `AbortSignal`.
 */

export interface AIModel {
  /** Stable identifier, unique within a provider. */
  id: string;
  /** Human-readable label (e.g. "llama3.2:latest"). */
  label: string;
  /** Optional: context window in tokens, pricing tier, etc. */
  note?: string;
}

export interface AIProviderStatus {
  /** true = ready to use. */
  available: boolean;
  /** Short reason if not available ("Ollama daemon not running", "API key missing"). */
  detail?: string;
  /** How many models are currently listed. */
  modelCount?: number;
}

export interface AICompleteOpts {
  model: string;
  /** User's task — "rewrite this paragraph", "continue from here", etc. */
  system?: string;
  /** The actual content the user wants transformed. */
  prompt: string;
  /** Surrounding document context to hand to the model. */
  context?: string;
  /** Max tokens to generate. */
  maxTokens?: number;
  /** Token-stream granularity. Kept for future tuning. */
  temperature?: number;
  /** Aborts in-flight request. */
  signal?: AbortSignal;
}

export interface AIChunk {
  /** Text to append to the current completion. */
  text: string;
  /** true on the final chunk. */
  done: boolean;
  /** Optional diagnostics — error text, token count, finish reason. */
  meta?: Record<string, unknown>;
}

export interface AIProvider {
  /** Stable id — `"ollama"`, `"anthropic"`, `"codex"`, etc. */
  readonly id: string;
  /** Human label for UI. */
  readonly label: string;
  /** Vendor grouping for the Preferences UI (e.g. `"anthropic"` groups API + Claude Code CLI). */
  readonly vendor?: string;
  /** Kind — determines how config / keys are handled. */
  readonly kind: 'http-local' | 'http-remote' | 'cli-spawn';
  /**
   * Whether this adapter can be used for inline autocomplete (ghost text).
   *
   * CLI agent providers (Claude Code, Codex, Gemini CLI, paseo) default to
   * `false` because they're fine-tuned as chat assistants — they interpret
   * the prompt as a task and respond conversationally instead of continuing
   * the user's prose. For autocomplete, use a direct API or Ollama.
   *
   * Defaults to `true` when not specified.
   */
  readonly supportsAutocomplete?: boolean;

  /** Probe + return state. Called by Preferences UI and on app boot. */
  detect(): Promise<AIProviderStatus>;

  /** List available models. Providers without an enumeration endpoint may return a hardcoded list. */
  listModels(): Promise<AIModel[]>;

  /** Stream a completion. Adapter yields chunks; caller renders. */
  complete(opts: AICompleteOpts): AsyncIterable<AIChunk>;
}
