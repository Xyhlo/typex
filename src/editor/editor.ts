import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from "@milkdown/core";
import { AllSelection } from "@milkdown/prose/state";
import {
  commonmark,
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  wrapInHeadingCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  createCodeBlockCommand,
  insertHrCommand,
  turnIntoTextCommand,
} from "@milkdown/preset-commonmark";
import { gfm, toggleStrikethroughCommand, insertTableCommand } from "@milkdown/preset-gfm";
import { history, redoCommand, undoCommand } from "@milkdown/plugin-history";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { clipboard } from "@milkdown/plugin-clipboard";
import { cursor } from "@milkdown/plugin-cursor";
import { indent } from "@milkdown/plugin-indent";
import { trailing } from "@milkdown/plugin-trailing";
import { replaceAll, getMarkdown, getHTML, callCommand } from "@milkdown/utils";
import { markdownPaste } from "./markdown-paste";
import { viewHooks } from "./view-hooks";
import { syntaxHighlight } from "./syntax-highlight";
import { wikilinkRenderPlugin } from "./wikilink-render";
import {
  externalFlashPlugin,
  flashExternalRange,
  showExternalCaret,
  hideExternalCaret,
} from "./external-flash";
import { streamApply, cancelStreamApply } from "./stream-apply";
import { ghostTextPlugin } from "./ghost-text";
import { attachAutocomplete, detachAutocomplete } from "../ai/autocomplete";
import {
  inlineAIEditPlugin,
  beginInlineAIEdit as beginInlineAIEditImpl,
  type InlineEditHandle,
} from "./inline-ai-edit";

export type EditorCommand =
  | "bold"
  | "italic"
  | "strike"
  | "inline-code"
  | "link"
  | "undo"
  | "redo"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "heading-4"
  | "heading-5"
  | "heading-6"
  | "paragraph"
  | "bullet-list"
  | "ordered-list"
  | "blockquote"
  | "code-block"
  | "hr"
  | "table";

export interface EditorController {
  setContent: (markdown: string) => Promise<void>;
  /**
   * Apply new markdown that came from an external write (AI stream, formatter,
   * git checkout). Preserves the editor's scroll position across the swap
   * and, if `flashChangedLines` is true, briefly highlights the top-level
   * blocks corresponding to the changed line range in the new source.
   *
   * When `stream` is true, the new content is applied gradually over ~400ms
   * with a blinking caret at the growing edge, so an atomic OS-level write
   * still looks like a live stream of characters.
   */
  applyExternalText: (
    markdown: string,
    opts?: {
      flashChangedLines?: boolean;
      oldMarkdown?: string;
      stream?: boolean;
    },
  ) => Promise<void>;
  /**
   * Cancel any in-flight stream apply and resolve its pending promise.
   * Call before switching tabs / loading new content so a stale stream
   * can't write into the new tab's buffer.
   */
  cancelStream: () => void;
  getContent: () => string;
  getHTML: () => string;
  focus: () => void;
  destroy: () => Promise<void>;
  run: (cmd: EditorCommand) => void;
  hasSelection: () => boolean;
  /** Current selection's plain text (empty string if no selection). */
  getSelection: () => string;
  /** Replace the current selection with `text`. No-op if no selection. */
  replaceSelection: (text: string) => void;
  /** Plain-text content immediately before the cursor, up to `maxChars` long. */
  getTextBeforeCursor: (maxChars?: number) => string;
  insertText: (text: string) => void;
  selectAll: () => void;
  applyLink: (href: string) => void;
  /** Start streaming ghost-text suggestions on this editor. Idempotent. */
  attachAIAutocomplete: () => void;
  /** Stop autocomplete + cancel any pending request. Called on tab swap / destroy. */
  detachAIAutocomplete: () => void;
  /**
   * Begin an inline AI edit. If there's a selection, it's cleared and the
   * returned handle's `originalText` holds what was there; if the cursor is
   * collapsed, the edit anchors at the cursor.
   */
  beginInlineAIEdit: () => InlineEditHandle;
}

export interface CreateEditorOpts {
  host: HTMLElement;
  initialContent: string;
  onChange: (markdown: string) => void;
  onReady?: () => void;
  onOpenWikilink?: (target: string, resolvedPath: string | null) => void;
}

export const createEditor = async (
  opts: CreateEditorOpts,
): Promise<EditorController> => {
  const { host, initialContent, onChange, onReady, onOpenWikilink } = opts;

  const wikilink = wikilinkRenderPlugin({
    onOpen: (target, resolved) => onOpenWikilink?.(target, resolved),
  });

  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, host);
      ctx.set(defaultValueCtx, initialContent);
      ctx.get(listenerCtx).markdownUpdated((_ctx, markdown, prev) => {
        if (markdown !== prev) onChange(markdown);
      });
    })
    .use(markdownPaste) // must register BEFORE clipboard so our paste hook wins
    .use(viewHooks)
    .use(syntaxHighlight)
    .use(wikilink)
    .use(externalFlashPlugin)
    .use(ghostTextPlugin)
    .use(inlineAIEditPlugin)
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(listener)
    .use(clipboard)
    .use(cursor)
    .use(indent)
    .use(trailing)
    .create();

  onReady?.();

  const proseRoot = (): HTMLElement | null =>
    host.querySelector<HTMLElement>(".ProseMirror");

  const focus = (): void => proseRoot()?.focus();

  const hasSelection = (): boolean => {
    let result = false;
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      result = view.state.selection.from !== view.state.selection.to;
    });
    return result;
  };

  const insertText = (text: string): void => {
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { from, to } = view.state.selection;
      view.dispatch(view.state.tr.insertText(text, from, to));
      view.focus();
    });
  };

  const getSelection = (): string => {
    let result = "";
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { from, to } = view.state.selection;
      if (from === to) return;
      result = view.state.doc.textBetween(from, to, "\n");
    });
    return result;
  };

  const replaceSelection = (text: string): void => {
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { from, to } = view.state.selection;
      if (from === to) return;
      view.dispatch(view.state.tr.insertText(text, from, to));
      view.focus();
    });
  };

  const getTextBeforeCursor = (maxChars = 2000): string => {
    let result = "";
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const cursor = view.state.selection.from;
      const start = Math.max(0, cursor - maxChars);
      result = view.state.doc.textBetween(start, cursor, "\n", "\n");
    });
    return result;
  };

  const selectAll = (): void => {
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const tr = view.state.tr.setSelection(new AllSelection(view.state.doc));
      view.dispatch(tr);
      view.focus();
    });
  };

  const runCmd = (cmd: EditorCommand): void => {
    const kv: Partial<Record<EditorCommand, () => void>> = {
      bold: () => editor.action(callCommand(toggleStrongCommand.key)),
      italic: () => editor.action(callCommand(toggleEmphasisCommand.key)),
      strike: () => editor.action(callCommand(toggleStrikethroughCommand.key)),
      "inline-code": () => editor.action(callCommand(toggleInlineCodeCommand.key)),
      link: () => editor.action(callCommand(toggleLinkCommand.key, { href: "" })),
      undo: () => editor.action(callCommand(undoCommand.key)),
      redo: () => editor.action(callCommand(redoCommand.key)),
      "heading-1": () => editor.action(callCommand(wrapInHeadingCommand.key, 1)),
      "heading-2": () => editor.action(callCommand(wrapInHeadingCommand.key, 2)),
      "heading-3": () => editor.action(callCommand(wrapInHeadingCommand.key, 3)),
      "heading-4": () => editor.action(callCommand(wrapInHeadingCommand.key, 4)),
      "heading-5": () => editor.action(callCommand(wrapInHeadingCommand.key, 5)),
      "heading-6": () => editor.action(callCommand(wrapInHeadingCommand.key, 6)),
      paragraph: () => editor.action(callCommand(turnIntoTextCommand.key)),
      "bullet-list": () => editor.action(callCommand(wrapInBulletListCommand.key)),
      "ordered-list": () => editor.action(callCommand(wrapInOrderedListCommand.key)),
      blockquote: () => editor.action(callCommand(wrapInBlockquoteCommand.key)),
      "code-block": () => editor.action(callCommand(createCodeBlockCommand.key)),
      hr: () => editor.action(callCommand(insertHrCommand.key)),
      table: () => editor.action(callCommand(insertTableCommand.key)),
    };
    try {
      kv[cmd]?.();
    } catch (err) {
      console.error(`[editor] command ${cmd} failed:`, err);
    }
  };

  const applyLink = (href: string): void => {
    if (!href) return;
    try {
      editor.action(callCommand(toggleLinkCommand.key, { href }));
    } catch (err) {
      console.error("[editor] applyLink failed:", err);
    }
  };

  /**
   * Generation counter — a late rAF scroll-restore from an older apply must
   * not clobber a newer one when stream chunks overlap.
   */
  let scrollGen = 0;

  /**
   * Split `md` into top-level blocks, each described by its `[firstLine, lastLine]`
   * (inclusive, 0-indexed). Blank lines separate blocks, but blank lines
   * *inside* fenced code blocks don't — they stay part of the fence.
   */
  const splitTopLevelBlocks = (
    md: string,
  ): Array<{ firstLine: number; lastLine: number }> => {
    const lines = md.split("\n");
    const blocks: Array<{ firstLine: number; lastLine: number }> = [];
    let inFence: "`" | "~" | null = null;
    let blockStart = -1;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (inFence) {
        if (
          (inFence === "`" && trimmed.startsWith("```")) ||
          (inFence === "~" && trimmed.startsWith("~~~"))
        ) {
          inFence = null;
        }
        continue;
      }
      if (trimmed.startsWith("```")) {
        if (blockStart < 0) blockStart = i;
        inFence = "`";
        continue;
      }
      if (trimmed.startsWith("~~~")) {
        if (blockStart < 0) blockStart = i;
        inFence = "~";
        continue;
      }
      if (trimmed === "") {
        if (blockStart >= 0) {
          blocks.push({ firstLine: blockStart, lastLine: i - 1 });
          blockStart = -1;
        }
        continue;
      }
      if (blockStart < 0) blockStart = i;
    }
    if (blockStart >= 0) {
      blocks.push({ firstLine: blockStart, lastLine: lines.length - 1 });
    }
    return blocks;
  };

  const mapLineRangeToBlockIndex = (
    md: string,
    range: { firstChangedLine: number; lastChangedLine: number },
  ): { firstBlock: number; lastBlock: number } | null => {
    const blocks = splitTopLevelBlocks(md);
    if (blocks.length === 0) return null;
    let firstBlock = -1;
    let lastBlock = -1;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (firstBlock < 0 && range.firstChangedLine <= b.lastLine) {
        firstBlock = i;
      }
      if (range.lastChangedLine >= b.firstLine) {
        lastBlock = i;
      }
    }
    if (firstBlock < 0) firstBlock = blocks.length - 1;
    if (lastBlock < firstBlock) lastBlock = firstBlock;
    return { firstBlock, lastBlock };
  };

  /** Compute the line range in `newMd` that differs from `oldMd`. */
  const diffLineRange = (
    oldMd: string,
    newMd: string,
  ): { firstChangedLine: number; lastChangedLine: number } | null => {
    if (!oldMd || !newMd) return null;
    const oldLines = oldMd.split("\n");
    const newLines = newMd.split("\n");
    let prefix = 0;
    const maxPrefix = Math.min(oldLines.length, newLines.length);
    while (prefix < maxPrefix && oldLines[prefix] === newLines[prefix]) prefix++;
    let suffix = 0;
    while (
      suffix < Math.min(oldLines.length - prefix, newLines.length - prefix) &&
      oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
    ) {
      suffix++;
    }
    const firstChangedLine = prefix;
    const lastChangedLine = newLines.length - suffix - 1;
    if (lastChangedLine < firstChangedLine) return null;
    return { firstChangedLine, lastChangedLine };
  };

  return {
    async setContent(md: string) {
      await editor.action(replaceAll(md));
    },
    async applyExternalText(md, opts = {}) {
      const scrollEl = proseRoot()?.parentElement ?? null;
      // Scroll restore only for atomic (non-stream) applies. During a stream,
      // capturing scroll once and restoring at the end yanks the viewport
      // back to the pre-stream position once the last chunk lands — terrible
      // for a long AI append where the user expects to track the growing edge.
      const useStream = opts.stream && opts.oldMarkdown !== undefined;
      const savedScroll = useStream ? null : scrollEl?.scrollTop ?? 0;

      const range =
        opts.flashChangedLines && opts.oldMarkdown
          ? diffLineRange(opts.oldMarkdown, md)
          : null;
      // Map source-line range → block index range by splitting the new
      // markdown into top-level blocks while respecting fenced code blocks.
      const blockRange = range ? mapLineRangeToBlockIndex(md, range) : null;

      if (opts.stream && opts.oldMarkdown !== undefined) {
        // Gradual apply — types out the new content over ~400ms with a
        // blinking caret at the growing edge.
        await new Promise<void>((resolve) => {
          streamApply(editor, opts.oldMarkdown ?? "", md, {
            animate: true,
            onTick: () => {
              // Update the caret to the current doc end.
              editor.action((ctx) => {
                const view = ctx.get(editorViewCtx);
                showExternalCaret(view, view.state.doc.content.size);
              });
            },
            onDone: () => {
              editor.action((ctx) => {
                const view = ctx.get(editorViewCtx);
                // Let the caret linger briefly after the last character so
                // the user sees the "done" flourish, then hide.
                window.setTimeout(() => hideExternalCaret(view), 600);
              });
              resolve();
            },
          });
        });
      } else {
        await editor.action(replaceAll(md));
      }

      if (blockRange) {
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const doc = view.state.doc;
          let idx = 0;
          let from = -1;
          let to = 0;
          doc.forEach((node, offset) => {
            if (idx >= blockRange.firstBlock && from < 0) from = offset;
            if (idx <= blockRange.lastBlock) to = offset + node.nodeSize;
            idx++;
          });
          if (from < 0) {
            // Range fell past the end — fall back to flashing the last block
            // so the user still gets a visual cue that something landed.
            const last = doc.lastChild;
            if (last) {
              const lastOffset = doc.content.size - last.nodeSize;
              flashExternalRange(view, {
                from: lastOffset,
                to: doc.content.size,
              });
            }
            return;
          }
          flashExternalRange(view, { from, to });
        });
      }

      // Atomic apply: restore scroll on the next frame so layout has settled.
      // For streams, savedScroll is null and we let ProseMirror's natural
      // scroll behavior ride — the user sees the stream grow in place.
      if (scrollEl && savedScroll !== null) {
        const myGen = ++scrollGen;
        requestAnimationFrame(() => {
          if (myGen !== scrollGen) return;
          scrollEl.scrollTop = savedScroll;
        });
      }
    },
    getContent() {
      return editor.action(getMarkdown());
    },
    getHTML() {
      return editor.action(getHTML());
    },
    focus,
    hasSelection,
    getSelection,
    replaceSelection,
    getTextBeforeCursor,
    insertText,
    selectAll,
    applyLink,
    cancelStream() {
      cancelStreamApply(editor);
    },
    attachAIAutocomplete() {
      try {
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          attachAutocomplete(view);
        });
      } catch (err) {
        console.warn("[editor] attachAIAutocomplete failed:", err);
      }
    },
    detachAIAutocomplete() {
      try {
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          detachAutocomplete(view);
        });
      } catch {
        /* editor already torn down */
      }
    },
    beginInlineAIEdit() {
      // Guaranteed non-null — we always return a real handle. If the editor
      // is torn down mid-stream, the handle's dispatches become no-ops.
      let result: InlineEditHandle | null = null;
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        result = beginInlineAIEditImpl(view);
      });
      return result as unknown as InlineEditHandle;
    },
    run: runCmd,
    async destroy() {
      try {
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          detachAutocomplete(view);
        });
      } catch {
        /* ignore */
      }
      await editor.destroy();
    },
  };
};

