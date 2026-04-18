/**
 * Standalone sanity check for the paste-detection heuristics in
 * src/editor/markdown-paste.ts. Runs without any bundler so we can quickly
 * verify "this Python code is detected as code and wrapped as fenced block"
 * before paying the MSI rebuild cost.
 */
import { createLowlight, common } from "lowlight";

const lowlight = createLowlight(common);

// ------------------ Copied verbatim from markdown-paste.ts ------------------

const looksLikeMarkdown = (s) => {
  if (/^[ \t]*#{1,6}\s+\S/m.test(s)) return true;
  if (/^[ \t]*>\s/m.test(s)) return true;
  if (/^[ \t]*[-*+]\s+\S/m.test(s)) return true;
  if (/^[ \t]*\d+\.\s+\S/m.test(s)) return true;
  if (/^[ \t]*(```|~~~)/m.test(s)) return true;
  if (/^[ \t]*\|[^|\n]+\|/m.test(s)) return true;
  if (/\[[^\]\n]+\]\([^)\n]+\)/.test(s)) return true;
  if (/!\[[^\]\n]*\]\([^)\n]+\)/.test(s)) return true;
  if (/^[ \t]*\[\s*[xX ]\s*\]\s/m.test(s)) return true;
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

// ------------------ Real input from the user's screenshot ------------------

const pythonSource = `#!/usr/bin/env python3
"""Test module for color highlighting verification."""

import os
import sys
from typing import List, Dict, Optional
from dataclasses import dataclass
from enum import Enum, auto


class Priority(Enum):
    """Task priority levels."""
    LOW = auto()
    MEDIUM = auto()
    HIGH = auto()
    CRITICAL = auto()


@dataclass
class Task:
    """Represents a task with various attributes."""
    name: str
    priority: Priority
    completed: bool = False
    tags: List[str] = None
    metadata: Dict[str, str] = None

    def __post_init__(self):
        if self.tags is None:
            self.tags = []
        if self.metadata is None:
            self.metadata = {}

    def mark_complete(self) -> None:
        """Mark the task as completed."""
        self.completed = True
        print(f"Task '{self.name}' marked as complete!")

    def add_tag(self, tag: str) -> None:
        """Add a tag to the task."""
        if tag not in self.tags:
            self.tags.append(tag)


class TaskManager:
    """Manages a collection of tasks."""

    def __init__(self, name: str):
        self.name = name
        self.tasks: List[Task] = []
        self._task_counter = 0

    def add_task(
        self,
        name: str,
        priority: Priority = Priority.MEDIUM,
        tags: Optional[List[str]] = None,
    ) -> Task:
        """Add a new task to the manager."""
        task = Task(
            name=name,
            priority=priority,
            tags=tags or [],
        )
        self.tasks.append(task)
        self._task_counter += 1
        return task

    def get_tasks_by_priority(self, priority: Priority) -> List[Task]:
        """Get all tasks with a specific priority."""
        return [t for t in self.tasks if t.priority == priority]
`;

// ------------------ Run the checks ------------------

console.log("== Input ==");
console.log(`  first line: ${JSON.stringify(pythonSource.split("\\n")[0])}`);
console.log(`  length: ${pythonSource.length} chars, ${pythonSource.split("\\n").length} lines`);
console.log();

const md = looksLikeMarkdown(pythonSource);
const code = looksLikeCode(pythonSource);
const lang = detectLanguage(pythonSource);

console.log("== Detection ==");
console.log(`  looksLikeMarkdown: ${md}`);
console.log(`  looksLikeCode:     ${code}`);
console.log(`  detectLanguage:    ${JSON.stringify(lang)}`);
console.log();

console.log("== Expected ==");
console.log(`  looksLikeMarkdown: false`);
console.log(`  looksLikeCode:     true`);
console.log(`  detectLanguage:    "python"`);
console.log();

const ok = md === false && code === true && lang === "python";
console.log(ok ? "\x1b[32m✓ All checks pass\x1b[0m" : "\x1b[31m✗ FAIL — one or more checks wrong\x1b[0m");
process.exit(ok ? 0 : 1);
