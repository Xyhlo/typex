# TypeX — Roadmap

> Your writing stays as plain files in a git repo. That repo lives on your laptops, your phone's browser, and GitHub simultaneously. The editor is fast enough that you forget it's there.

That's the whole thing. Everything below is what falls out of that decision.

***

## Table of contents

1. [Positioning](#positioning)
2. [Feature pillars](#feature-pillars)
3. [Cross-device + sync architecture](#cross-device--sync-architecture)
4. [GitHub as a first-class surface](#github-as-a-first-class-surface)
5. [A day with TypeX — user flow](#a-day-with-typex--user-flow)
6. [Competitive: TypeX vs Obsidian](#competitive-typex-vs-obsidian)
7. [Phased delivery plan](#phased-delivery-plan)
8. [Cross-cutting work](#cross-cutting-work)
9. [Calendar](#calendar)
10. [The discipline test](#the-discipline-test)

***

## Positioning

**Obsidian is a second brain. TypeX is a better pen.**

Obsidian is a personal-knowledge-management tool that happens to edit markdown. TypeX is a markdown *editor* that happens to organize files. Different users. Different centers of gravity. Trying to out-Obsidian Obsidian is how we die.

The audience we serve:

* Developers writing READMEs, design docs, blog posts.

* Academics writing papers with citations and LaTeX exports.

* Technical writers writing product docs.

* Bloggers writing posts.

* Anyone who left Typora and regretted where they landed.

What they want: WYSIWYG that actually is WYSIWYG, fast native feel, git as a first-class citizen, painless export, free sync. What they don't want: a graph view, a canvas, or a daily-notes workflow. We build the first list and decline the second.

***

## Feature pillars

### The 5 editor moves

1. **Tri-mode that earns its keep.** WYSIWYG ↔ raw source (CodeMirror 6 over the same buffer) ↔ side-by-side with cursor sync. The gap isn't *having* the modes — it's making a flip feel instant and keeping the caret in the same paragraph across modes. Most editors fumble this.
2. **Git as context, not a client.** Gutter marks vs HEAD, hover-blame with GitHub avatars, "stage this hunk" from the editor. Skip the full branch/merge UI — that's what `git` is for. Ship a "Changes" panel per folder, not a whole VCS.
3. **Watch + reload with diff review.** External change → toast with a 3-way diff, not a silent overwrite. Typora and Obsidian both get this wrong.
4. **Plugin surface before a plugin store.** Capability-scoped manifest (`on-load`, `on-save`, `on-render`, `on-command`), sandboxed JS, filesystem-scoped to the current vault. markdownlint and Prettier ship as first-party plugins so the API is proven before third parties touch it.
5. **AI as a provider, not a feature.** One interface (`rewrite / continue / critique / summarize`), multiple backends (Ollama local, Anthropic, OpenAI). Users pick. Keeps us out of the "AI editor" trap where the AI *is* the product.

### Borrowed from Obsidian, without copying the app

* `[[Backlinks]]` — useful even in a doc vault. Add them.

* Frontmatter / properties panel — useful for any markdown workflow.

* Tags with a tag index — cheap to ship.

* Outline / table of contents side panel — every writer wants this.

### Declined, on purpose

* Graph view.

* Canvas.

* Daily notes / periodic notes workflow.

If a user asks, the answer is: *Obsidian is better at that and it's free for personal use.* Discipline is the feature.

***

## Cross-device + sync architecture

**Local-first files + Git as the sync fabric + GitHub OAuth as the account.** One decision that answers every cross-device requirement at once.

* Vault = a folder. A folder can be plain, or it can be a git repo.

* If it's a git repo, TypeX handles push/pull/merge in the background with visible status.

* Sign-in = "Sign in with GitHub." That's the account. No custom auth surface, no password resets, no billing plumbing, no PII we have to guard.

* Anonymous users keep 100% local, no degradation — just no sync.

* Cross-device = clone the same repo on the next device. Windows, macOS, web, iOS all speak git.

This is the only approach where we don't end up running a CRDT relay, an object store, an auth service, *and* a billing layer before we ship v2.

### Architecture moves

1. **Git-aware sync, not "upload my folder."** Autocommit with configurable cadence (on save / on idle / manual), autopush if online, autopull on focus. Merge conflicts get a real 3-way diff UI — the one thing Obsidian Sync and iCloud both fumble. Doubles as the git/diff feature from the pillars.
2. **Provider abstraction from day one.** `GitProvider` interface; GitHub first, GitLab / Gitea / self-hosted second. Don't hardcode `api.github.com` anywhere outside that layer or we'll regret it in 6 months.
3. **Web build = same bundle, no Tauri.** Editor runs in the browser. Vault = a GitHub repo via isomorphic-git in a Worker, or a local folder via File System Access API where supported. This is the *realistic* iOS story for v1 — Safari users get a working editor without a native app shipping.
4. **Native iOS as a year-2 bet, not a blocker.** SwiftUI shell + WKWebView hosting the same editor bundle + a Swift bridge for filesystem/git (libgit2). Not a rewrite; a port of the shell.
5. **Real-time co-editing isn't on this roadmap.** Git can't do it. If it becomes a top-ten user request, layer Yjs on top for active-session-only, flush to git on commit. Don't front-load the CRDT.

### Honest tradeoffs

* **Git handles text beautifully, binaries terribly.** Image-heavy vaults need LFS, and LFS on iOS Safari is grim. Ship "sync works best for text-heavy vaults" as an honest caveat in the UI, not a footnote.

* **GitHub lock-in risk.** Routing sync + auth + projects through one provider is leverage they can revoke. The provider abstraction is non-negotiable for that reason.

* **"Anonymous can't sync" is a feature if we signpost it well.** A "Sign in to sync across devices" affordance has to live somewhere the unsigned user sees it without nagging.

* **Conflict UI is the make-or-break.** If merge conflicts dump the user into raw `<<<<<<<` markers the way Obsidian does, we've lost. Budget real engineering weeks for the 3-way diff, not a weekend.

* **Web build means CSP + CORS headaches** around GitHub's API, isomorphic-git's bundle size (\~500KB gz), and the File System Access API's patchy support. Budget that, too.

***

## GitHub as a first-class surface

Not a sync afterthought. A surface.

* **Repo picker replaces "Open folder" when signed in.**

* **Tree view of every markdown file in the repo** — default to README.md on open.

* **Inline** **`#412`** **issue references** with open / closed / merged status and hover preview.

* **"Create PR from branch"** + **"Publish as Gist"** from the command palette.

* **`git blame`** **side-rail** with GitHub avatars on each line.

* **GitHub Actions status** for docs-build workflows in the status bar.

* **Recent projects = recent repos.**

***

## A day with TypeX — user flow

**Morning, at the desktop.** You double-click `design-doc.md` in Explorer. TypeX's branded icon told you which file it was before you clicked. The app opens with the sidebar collapsed — you asked to see one file, you get the file, full width. The titlebar shows a quiet "synced 2m ago" pill.

**You type.** WYSIWYG by default. A code fence appears as you type ` ```python ` — it highlights inline, colors match the theme. You hit `Ctrl+/` to drop into raw source because you want to tweak a YAML block; same file, same cursor paragraph, instant flip. `Ctrl+\` gives you the split view with synced scroll. You flip back.

**The gutter has opinions.** Three lines have a green bar (added vs HEAD), one has a blue bar (modified). You hover the modified line — avatar of the teammate who last touched it, commit message on a tooltip. No separate git tool. No context switch.

**You paste a log snippet from Slack.** It's Python. TypeX recognizes it's code, not prose, wraps it in a fenced block, highlights it. The earlier "# comment becomes heading" bug is dead.

**An AI call, not an AI takeover.** Select an awkward paragraph → palette → "Rewrite clearer." A side-panel shows the suggestion diffed against your text. Accept or discard. The backend is Ollama on your box by default; switch to Claude for a heavier lift. The editor doesn't suddenly become a chatbot.

**Save.** Autocommit 3 seconds after your last keystroke. Autopush if online. The pill now reads "synced."

**Afternoon, coffee shop, iPad.** Safari → `app.typex.so` → sign in with GitHub → pick the same repo. isomorphic-git clones it in a worker. You fix a typo from the couch. Push. Not as fast as the desktop, but the work is real work, not a separate "mobile notes" app you'll have to reconcile later.

**Back at the desk, a merge.** Your teammate pushed while you were out. Focus returns to TypeX → toast slides in: *"Upstream changes on* *`design-doc.md`. Review?"* A 3-way diff, rendered as two prose columns plus a merged column. You pick hunks. You commit. No `<<<<<<<` markers ever touch your face.

**A reference to** **`#412`** **in a paragraph** has quietly become a link with a "merged" badge. Hover it — PR title, author, date. The GitHub integration isn't a separate panel, it's just *present*.

**Publish time.** Command palette: "Export → PDF → Academic theme." Pandoc ships in the MSI, so it just works. Or: "Create PR from branch," and you skip the terminal entirely.

**Evening, another machine.** Your spouse's laptop, you install TypeX, sign in with GitHub, pick the repo. Everything's there. No "import my vault" step, no "transfer save files," no subscription page.

***

## Competitive: TypeX vs Obsidian

### Where Obsidian beats us today (honest)

* Backlinks, graph view, tags as a first-class network. Their killer feature.

* 1,000+ community plugins. Four years of network effects. Uncatchable in feature count.

* Native iOS and Android apps shipping today.

* Canvas — visual whiteboard of notes. Cult feature.

* Daily notes / periodic notes workflow baked in.

* Community moat — YouTube tutorials, templates, influencers, $10 courses.

* Four years of polish — bug fixes, edge cases, muscle memory.

If someone is building a second brain, they should use Obsidian. We aren't going to win that user in year one, and we shouldn't waste a roadmap chasing them.

### Where TypeX beats Obsidian (specific)

* **Actual WYSIWYG.** Obsidian's "Live Preview" still shows raw `**` around bold and raw `|` in tables when the cursor is on that line. It's a compromise. Milkdown isn't.

* **Native speed.** Tauri shell + a tight bundle vs. Electron. Cold start and huge-file responsiveness are measurably better.

* **Git is core, not a plugin.** The "Obsidian Git" community plugin is famously flaky. Ours is first-party, syncs automatically, and has a real 3-way merge UI.

* **Free sync.** Obsidian Sync is $96/year. GitHub is free.

* **Format breadth.** Pandoc is in the installer — docx, epub, LaTeX, 40+ formats. Obsidian is markdown-only natively; anything else is a plugin you configure.

* **AI as a first-class surface.** Not a plugin. Not Claude-only or OpenAI-only. One interface, pick your backend.

* **Open source, MIT, no freemium.** Obsidian is closed-source with paid Sync and paid Publish.

* **Design.** Out-of-box, we are prettier and less dense.

### How we win

1. **Claim the Typora audience first, not the Obsidian audience.** Typora refugees want a polished WYSIWYG editor — a thing Obsidian *isn't*.
2. **Position as "the editor for people who write things that get published."**
3. **Steal Obsidian's best ideas without copying the whole app** (backlinks, properties, tags, outline). Skip graph view and canvas.
4. **Be unambiguously better at what Obsidian is worst at** — WYSIWYG, git, speed, export, default aesthetics, free sync.
5. **Use open source as a moat** against their closed-source freemium model.
6. **Plugin API quality > quantity.**
7. **Ship native iOS in year two.** Power users won't leave Obsidian without it.
8. **Don't engage on PKM.** Don't build a graph view because a reviewer asked for one.

***

## Phased delivery plan

Four strategic beats, in order, each standing on the previous:

**Editor craft → Git-native → Cross-device → Extensible.**

Publishing, mobile, and community are polish or scale work on top. Each beat ships as a standalone version that's independently worth using.

### Phase 0 — Where we are (v0.1.2, shipped)

WYSIWYG editor, tabs, session restore, two themes, design system, Pandoc export, MSI installer with branded file icons, first-run default-app prompt, progress toasts.

**Position today:** a polished Typora replacement. Good, but not distinct.

### Phase 1 — "Editor craft" (v0.2.x, 4–6 weeks)

Make the editor itself undeniably better than what Typora or Obsidian ships.

| Ship                                                         | Why it matters                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| **Tri-mode with cursor sync** (WYSIWYG ↔ raw source ↔ split) | The single feature Obsidian fumbles. Our wedge against them.              |
| **Outline / TOC side panel**                                 | Every writer wants this. Cheap, high return.                              |
| **Frontmatter / properties panel**                           | Matches Obsidian's best ergonomic feature.                                |
| **Tags (`#tag`) with a tag index**                           | Cheap. Closes a common "but does it have…" objection.                     |
| **`[[Backlinks]]`** **wiki-links**                           | Steals Obsidian's idea without copying the whole app. Vault-scoped index. |
| **Smarter paste** (extend language detection)                | Quality signal for developer users.                                       |

**The one hard spike:** mapping cursor position between ProseMirror's doc and the raw markdown string. Prototype this first, in isolation. If it doesn't feel instant, ship WYSIWYG + raw as separate modes first and add split later.

**Done when:** a Typora user or a Live Preview Obsidian user opens TypeX and doesn't want to go back.

### Phase 2 — "Git-native" (v0.3.x, 6–8 weeks)

Git stops being a plugin anywhere in the world. Ours is first-party and invisible.

| Ship                                                                           | Why it matters                                                                  |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| **libgit2 backend** (via `git2-rs`)                                            | Shelling out to `git` won't keep up with live gutter updates.                   |
| **Gutter marks vs HEAD** (added / modified / removed)                          | VS Code ergonomics for prose writers.                                           |
| **Blame-on-hover with GitHub avatars**                                         | Context, not a client.                                                          |
| **Watch + 3-way reload** (external change → diff review, not silent overwrite) | Typora and Obsidian both get this wrong.                                        |
| **Autocommit / autopush / autopull** with a visible sync pill                  | Foundation for Phase 3.                                                         |
| **GitHub OAuth (device flow)**                                                 | The account. The only account we ship.                                          |
| **Repo picker as vault source** (`Open repo…`)                                 | Collapses two features into one UX.                                             |
| **Provider abstraction at the interface level**                                | Don't hardcode `api.github.com`. Regretting this later is guaranteed otherwise. |

**Risks:** libgit2 bundling across Windows / macOS / Linux; OAuth redirect URL for a desktop app (use device flow, not a local HTTP server).

**Done when:** a user can clone a repo in TypeX, edit, and push — without touching a terminal — and gutter marks feel as native as VS Code.

### Phase 3 — "Cross-device" (v0.4.x, 8–10 weeks)

| Ship                                                              | Why it matters                                                      |
| ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| **3-way merge UI** (prose-rendered, hunk-accept)                  | The make-or-break feature. Budget real weeks.                       |
| **Web build** (same Svelte+Milkdown bundle, no Tauri)             | Stopgap mobile story; on-ramp for curious users without installing. |
| **isomorphic-git in a Worker** + OPFS storage                     | Vault = a GitHub repo, clonable in the browser.                     |
| **File System Access API fallback** (Chrome / Edge)               | Non-signed-in web users still get something.                        |
| **Sync status surface** (pill → detail panel with last-N commits) | Makes the magic visible.                                            |
| **Auto-update for desktop** (Tauri updater)                       | Required before users depend on us.                                 |
| **Crash + error telemetry** (opt-in)                              | Required for the same reason.                                       |

**Risks:** bundle size (isomorphic-git + Milkdown is not small), CORS / CSP on GitHub API, OPFS quota surprises on iOS Safari.

**Done when:** one user can bounce between desktop and an iPad browser on the same vault without thinking about it.

### Phase 4 — "Extensible" (v0.5.x, 8–10 weeks)

Quality of API matters more than count. Don't race Obsidian's 1,000 plugins. Ship a better API and prove it.

| Ship                                                                                                             | Why it matters                               |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Plugin manifest + capability scopes** (`fs`, `network`, `editor.commands`, `ui.panel`, `on-save`, `on-render`) | Calcifies early — design it very carefully.  |
| **Sandboxed runtime** (Web Worker + structured-clone bridge; later: separate process)                            | Security-by-design beats retrofit.           |
| **First-party plugins, dogfood-only at first:** markdownlint, Prettier, AI assist, git-blame-panel               | Prove the API before third parties touch it. |
| **AI as a first-party plugin, multi-backend** (Ollama local, Anthropic, OpenAI; user picks)                      | Not the product — an accent.                 |
| **Command palette surface** as the main plugin entry point                                                       | Keeps the UI from metastasizing.             |

**Risks:** plugin API lock-in. Treat v1 of the API as an RC for a cycle before freezing.

**Done when:** you could remove `markdownlint` from core and reinstall it from the plugin panel, and nothing would feel different.

### Phase 5 — "Publishing" (v0.6.x, 4–6 weeks)

| Ship                                                                             | Why it matters                                          |
| -------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Export themes** (Academic, Memo, Engineering, Minimal) for HTML + PDF          | Obsidian Publish is $8/mo; ours is a menu item.         |
| **"Create PR from branch"** + **"Publish as Gist"** from the command palette     | GitHub as a first-class surface, not a panel.           |
| **Inline issue/PR references** (`#412` → link with open / closed / merged badge) | The small polish that signals we take GitHub seriously. |
| **GitHub Actions status** for docs-build workflows in the status bar             | Completes the "git-native" promise.                     |
| **Static site export** (one command → deployable HTML/CSS bundle)                | Replaces Obsidian Publish for writers who want a site.  |

### Phase 6 — "Mobile" (v1.0, 12–16 weeks)

| Ship                                                                                                                       | Why it matters                               |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Native iOS app**: SwiftUI shell + WKWebView hosting the same editor bundle + a Swift bridge for filesystem/git (libgit2) | Power users won't leave Obsidian without it. |
| **macOS code-sign + notarize**                                                                                             | Already possible; must ship before iOS.      |
| **1.0 polish pass**: onboarding, accessibility audit, keyboard-only flow, dark-mode-first marketing pass                   | The version we put on HN.                    |
| **Pricing page** — explicit "free, forever, open source" positioning                                                       | The anti-Obsidian stance made legible.       |

### Phase 7 — Post-1.0 (ongoing)

* **GitLab / Gitea providers** (unlocks self-hosted + privacy-conscious users)

* **Android app** (same pattern as iOS, different shell)

* **Community plugin registry** (only once Phase 4's API has survived real third-party usage)

* **Localization** (starts with RTL support + one Asian language as the stress test)

* **CRDT live co-editing** *only if* users demand it — bolt on top of the file + git base, never replace them

***

## Cross-cutting work

Parallel to every phase:

* **Marketing beats per phase.** Blog post + release video + HN / Reddit / lobste.rs post per version. The Obsidian subreddit is where our users live right now; show up there with actual value (e.g., "git-sync that actually works") not with ads.

* **Changelog discipline.** Release notes in the MSI *and* on the site. Already doing this. Keep it.

* **A reserved "nope, not shipping" list.** Graph view. Canvas. Daily notes workflow. If a user asks, the answer is "Obsidian is better at that and it's free for personal use." Discipline is the feature.

***

## Calendar

Rough year-one calendar at a brisk indie pace (one focused dev):

* **Q1 2026** — Phase 1 + 2 (editor craft + git-native)

* **Q2 2026** — Phase 3 (cross-device) + telemetry + auto-update

* **Q3 2026** — Phase 4 (plugin API + AI) — the riskiest quarter

* **Q4 2026** — Phase 5 (publishing) + iOS groundwork

* **Q1 2027** — Phase 6, v1.0 ships

With a second contributor, shave roughly a quarter. With marketing attached to each release, v1.0 ships to an audience that's been watching.

***

## The discipline test

Every feature request, at every phase, gets one question:

> *Does this make the editor feel better for a developer writing a README, an academic writing a paper, or a blogger writing a post?*

If no — even if it's a great feature — it's out of scope. That's the knife that keeps us from becoming Obsidian.

---

## Markdown Test

### Headers & Text

# H1 Header
## H2 Header
### H3 Header

This is **bold text** and this is *italic text*. You can also use ~~strikethrough~~ and `inline code`.

### Lists

- Unordered item one
- Unordered item two
  - Nested item
- Unordered item three

1. First ordered item
2. Second ordered item
3. Third ordered item

### Code Block

```python
def greet(name: str) -> str:
    return f"Hello, {name}!"

print(greet("World"))
```

### Table

| Feature | Status | Priority |
|---------|--------|----------|
| WYSIWYG | ✅ Done | High |
| Git Sync | 🚧 WIP | Medium |
| AI Assist | 🔜 Planned | Low |

### Blockquote

> "The universe is under no obligation to make sense to you." — Neil deGrasse Tyson

### Links & Images

[Visit GitHub](https://github.com)

---

*End of markdown test.*

### Task Lists

- [x] Create project structure
- [x] Setup CI/CD pipeline
- [ ] Write documentation
- [ ] Add unit tests
- [ ] Deploy to production

### Nested Blockquotes

> Level one quote
>
> > Level two quote
> >
> > > Level three quote — going deep!

### Footnotes

Here is a sentence with a footnote reference.[^1] And another one.[^2]

[^1]: This is the first footnote. It can be as long as you want.
[^2]: The second footnote supports **bold** and *italic* too.

### Horizontal Rules

Three different styles:

---

***

___

### Definition List

**TypeScript**
: A strongly typed superset of JavaScript

**Rust**
: A systems programming language focused on safety and performance

**Go**
: A statically typed, compiled language designed at Google

### Math Inline

The mass-energy equivalence is given by $E = mc^2$. The area of a circle is $A = \pi r^2$.

### Emoji & Symbols

- Checkmarks: ✅ ❌ ⚠️
- Arrows: → ← ↑ ↓ ↔ ⇒ ⇔
- Stars: ★ ☆ ✦ ✧
- Misc: 🔥 💡 🚀 🎯 📝

### Keyboard Shortcuts

Press `Ctrl` + `S` to save, `Ctrl` + `Z` to undo, or `Ctrl` + `Shift` + `P` to open the command palette.

### Admonition-Style Blocks

> [!NOTE]
> This is a GitHub-style note block.

> [!WARNING]
> Be careful with this operation — it cannot be undone.

> [!TIP]
> Try using the split view for side-by-side editing.

### YAML Frontmatter

```yaml
---
title: "Markdown Test Document"
author: "TypeX"
date: 2026-04-19
tags:
  - test
  - markdown
  - highlighting
draft: false
---
```

### Diff Block

```diff
- function oldGreet(name) {
-   return "Hello, " + name;
- }
+ function newGreet(name: string): string {
+   return `Hello, ${name}!`;
+ }
```

### JSON Block

```json
{
  "name": "typex",
  "version": "0.1.2",
  "description": "A markdown editor for people who publish",
  "license": "MIT",
  "features": ["wysiwyg", "git-sync", "ai-assist", "themes"]
}
```

### HTML in Markdown

<details>
<summary>Click to expand</summary>

This is hidden content written in **Markdown** inside an HTML `<details>` tag. It demonstrates that HTML and Markdown can mix.

</details>

<center>
  <em>This text is centered using HTML.</em>
</center>

---

*That's all for the extended markdown test.*
