/**
 * Standalone sanity check for the paste-detection heuristics in
 * src/editor/markdown-paste.ts. Runs without any bundler so we can quickly
 * verify "this Python code is detected as code and wrapped as fenced block"
 * before paying the MSI rebuild cost.
 */
import { createLowlight, common } from "lowlight";

const lowlight = createLowlight(common);

// ------------------ Copied verbatim from markdown-paste.ts ------------------

const hasStrongMarkdown = (s) => {
  if (/^[ \t]*(```|~~~)/m.test(s)) return true;
  if (/^[ \t]*>\s/m.test(s)) return true;
  if (/^[ \t]*\|[^|\n]+\|/m.test(s)) return true;
  if (/^[ \t]*[-*+]\s+\[[ xX]\]\s/m.test(s)) return true;
  if (/!\[[^\]\n]*\]\([^)\n]+\)/.test(s)) return true;
  return false;
};

const hasWeakMarkdown = (s) => {
  if (/^[ \t]*#{1,6}\s+\S/m.test(s)) return true;
  if (/^[ \t]*[-*+]\s+\S/m.test(s)) return true;
  if (/^[ \t]*\d+\.\s+\S/m.test(s)) return true;
  if (/\*\*[^*\n]+\*\*/.test(s)) return true;
  if (/\[[^\]\n]+\]\([^)\n]+\)/.test(s)) return true;
  return false;
};

const looksLikeCode = (s) => {
  const lines = s.split(/\r?\n/);
  if (lines.length < 2) return false;
  if (lines[0].startsWith("#!")) return true;
  if (/^\s*<\?(xml|php)\b/.test(lines[0])) return true;
  if (/^\s*<!DOCTYPE/i.test(lines[0])) return true;

  let keywordHits = 0;
  let punctHits = 0;
  const keywordRe =
    /^[ \t]*(function|def|class|import|from|const|let|var|public|private|protected|static|async|await|export|package|namespace|using|include|require|module|struct|interface|enum|fn|trait|impl|if|for|while|switch|try|catch|throw|return|yield|break|continue|new|this|super)\b/;
  const punctRe = /[{};]|=>|->|:=|!=|==|>=|<=/;

  for (const line of lines) {
    if (keywordRe.test(line)) keywordHits++;
    if (punctRe.test(line)) punctHits++;
  }

  if (keywordHits >= 2) return true;
  if (punctHits / lines.length > 0.3 && punctHits >= 3) return true;
  return false;
};

const detectLanguage = (text) => {
  const firstLine = (text.split(/\r?\n/)[0] ?? "").trim();

  if (firstLine.startsWith("#!")) {
    if (/\bpython[0-9.]*\b/.test(firstLine)) return "python";
    if (/\bnode\b/.test(firstLine)) return "javascript";
    if (/\b(ba|z|)sh\b/.test(firstLine)) return "bash";
    if (/\bruby\b/.test(firstLine)) return "ruby";
    if (/\bperl\b/.test(firstLine)) return "perl";
    if (/\bdeno\b/.test(firstLine)) return "typescript";
  }
  if (/^\s*<\?php\b/i.test(firstLine)) return "php";
  if (/^\s*<\?xml\b/i.test(firstLine)) return "xml";

  try {
    const r = lowlight.highlightAuto(text);
    const lang = r.data?.language;
    if (lang && typeof lang === "string" && lang !== "plaintext") return lang;
  } catch (err) {
    console.error("[detectLanguage] auto-detect threw:", err);
  }
  return "";
};

// ------------------ Test cases ------------------

const pythonWithComments = `#!/usr/bin/env python3
"""Test module for color highlighting verification."""

# This is a simple Python comment
# Another comment explaining what's next

import os
import sys
from typing import List, Dict, Optional


class Priority(Enum):
    """Task priority levels."""
    # Levels defined in ascending order
    LOW = auto()
    MEDIUM = auto()
    HIGH = auto()


@dataclass
class Task:
    """Represents a task with various attributes."""
    name: str
    priority: Priority

    def __post_init__(self):
        # Initialize defaults
        if self.tags is None:
            self.tags = []

    def mark_complete(self) -> None:
        """Mark as completed."""
        self.completed = True
        print(f"Task '{self.name}' marked as complete!")
`;

const realMarkdown = `# Hello

This is a doc with real markdown.

> A quote here.

- bullet one
- bullet two

\`\`\`python
print("hi")
\`\`\`
`;

const typescriptSnippet = `export const greet = (name: string): string => {
  return \`Hello, \${name}!\`;
};

const mood = "flowing";
console.log(greet(mood));
`;

// ------------------ Run the checks ------------------

const cases = [
  {
    name: "Python with # comments (the user's case)",
    input: pythonWithComments,
    expect: { strongMd: false, weakMd: true, code: true, lang: "python" },
    shouldWrap: true, // because strongMd=false AND code=true
  },
  {
    name: "Real markdown with fence + quote + list",
    input: realMarkdown,
    expect: { strongMd: true, weakMd: true, code: false, lang: "" },
    shouldWrap: false, // because strongMd=true
  },
  {
    name: "TypeScript snippet, no shebang, no comments",
    input: typescriptSnippet,
    expect: { strongMd: false, weakMd: false, code: true, lang: "typescript" },
    shouldWrap: true,
  },
];

let failed = 0;
for (const c of cases) {
  const strongMd = hasStrongMarkdown(c.input);
  const weakMd = hasWeakMarkdown(c.input);
  const code = looksLikeCode(c.input);
  const lang = detectLanguage(c.input);
  const wrap = !strongMd && code;

  const langOk = c.expect.lang === "" ? true : lang === c.expect.lang;
  const ok =
    strongMd === c.expect.strongMd &&
    weakMd === c.expect.weakMd &&
    code === c.expect.code &&
    langOk &&
    wrap === c.shouldWrap;

  const mark = ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
  console.log(`${mark} ${c.name}`);
  console.log(
    `    strongMd=${strongMd} weakMd=${weakMd} code=${code} lang=${JSON.stringify(lang)} wrap=${wrap}`,
  );
  if (!ok) {
    console.log(
      `    EXPECTED strongMd=${c.expect.strongMd} weakMd=${c.expect.weakMd} code=${c.expect.code} lang=${JSON.stringify(c.expect.lang)} wrap=${c.shouldWrap}`,
    );
    failed++;
  }
}

process.exit(failed === 0 ? 0 : 1);
