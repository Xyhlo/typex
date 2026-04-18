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
  getContent: () => string;
  getHTML: () => string;
  focus: () => void;
  destroy: () => Promise<void>;
  run: (cmd: EditorCommand) => void;
  hasSelection: () => boolean;
  insertText: (text: string) => void;
  selectAll: () => void;
  applyLink: (href: string) => void;
}

export interface CreateEditorOpts {
  host: HTMLElement;
  initialContent: string;
  onChange: (markdown: string) => void;
  onReady?: () => void;
}

export const createEditor = async (
  opts: CreateEditorOpts,
): Promise<EditorController> => {
  const { host, initialContent, onChange, onReady } = opts;

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

  return {
    async setContent(md: string) {
      await editor.action(replaceAll(md));
    },
    getContent() {
      return editor.action(getMarkdown());
    },
    getHTML() {
      return editor.action(getHTML());
    },
    focus,
    hasSelection,
    insertText,
    selectAll,
    applyLink,
    run: runCmd,
    async destroy() {
      await editor.destroy();
    },
  };
};

