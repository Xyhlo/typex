# TypeX — Roadmap

## Thesis

**Obsidian is configured. Typora is abandoned. TypeX is just open-and-write.**

We're building the Markdown editor for people who want to write — not configure a second brain, not hunt a plugin marketplace, not wait a second for Electron to boot. Native, opinionated, finished.

We're not trying to be a platform. We're trying to be a pen.

### Who we're for

- **Typora refugees.** Typora went paid in 2021, then effectively stopped shipping. There's a live population actively shopping for "Typora, but maintained."
- **Obsidian dropouts.** People who tried Obsidian, drowned in plugins and config, closed it.
- **Technical bloggers + academics + doc writers.** Folks who publish what they write and need git + Pandoc + AI without assembling them from extensions.

### Who we're not for

- Developers who want a code editor with markdown support. (Use VS Code.)
- Knowledge gardeners who want a graph / canvas / PKM second brain. (Use Obsidian.)
- Anyone who wants a mobile-first writing app. (Use Bear, Craft, or Ulysses.)

***

## Shipped

- **v0.1.x** — beta: WYSIWYG editor, tabs, session restore, themes, Pandoc export, MSI installer, Windows file associations.
- **v0.3.0** — editor craft + git-native: tri-mode (WYSIWYG / raw / split), outline, tags, wikilinks, backlinks, properties, smart paste, status pill, gutter marks, blame, autocommit / autopush / autopull, multi-root workspaces, live-stream external writes, 3-way external-change handling, clone dialog.
- **v0.4.0** — AI for writing, without the chatbot: seven adapters (Ollama + Anthropic / OpenAI / Gemini APIs + Claude Code / Codex / Gemini CLI agents), OS-keychain secret storage, inline ghost-text autocomplete with custom prompts, in-place Rewrite / Fix / Translate / Continue with accent glow + streaming caret, Summarize to clipboard, right-click menu, per-provider dynamic model lists + user-added model IDs. Off by default, zero telemetry.

***

## v0.5 — "Open and write" · paid tier launch

**Target: 6–7 weeks.** The release that turns TypeX into a business. Ships the first paid tier, the first server component, and enough polish to stand up honestly against Obsidian for writers.

### The positioning

- **"Obsidian without the plugins."** Every feature is first-party. No community registry. No "install Obsidian Git," no "install Dataview." If it matters, we build it.
- **"Typora's successor, actively shipped."** Real WYSIWYG, native speed, same editorial feel, plus git and AI. Not abandoned.

### What's new for *everyone* (free tier)

The free version has to be good enough that a Typora refugee or an Obsidian dropout chooses TypeX and tells their friends. These make that true:

- **Zero-ceremony first run.** Open TypeX → blank doc → start writing. No vault-picker dialog, no welcome tour blocking the editor, no plugin-recommendation modal. You write within 5 seconds of launch.
- **"Folders are vaults."** Drop the word *vault*. You open a folder. You write documents in it. End of ontology.
- **A onboarding doc, not a tour.** A single pre-loaded `welcome.md` in the demo workspace that's also a live document you can edit. Shows rather than explains.
- **Export themes** — four built-in print-ready themes (Plain, Academic, Memo, Blog) available via `Ctrl+K → Export as…`. Free users get all four; Pandoc does the work.
- **Anti-plugin marketing.** The landing + README lead with: "no plugins, no plugin store, no plugin updates, no broken plugins on a new release. Everything ships built-in."

### What's new for Pro users ($8/mo or $72/yr)

The value prop in one sentence: **stop setting things up.** A free user wires git / AI / sync / backup / publish themselves. A Pro user signs in once and it all just works.

- **Bundled AI** — 2 million MiniMax tokens/month. Ghost text, Rewrite, Fix, Translate, Continue, Summarize — all use your monthly credit bucket. No keys pasted. Status bar shows `PRO · 1.4M left`.
- **Theme editor** — visual color / accent / font picker. Unlimited custom themes. Synced across your devices automatically.
- **GitHub OAuth** — one-click sign-in (device flow, no browser redirect loop). Inline `#412` PR references with open / closed / merged status. GitHub Actions status in the status bar.
- **Cloud backup** — encrypted snapshots on every save, 30-day rolling history. "Restore from 2 days ago" is a palette command.
- **Cross-device sync** — open TypeX on a second machine, sign in, your vault appears. No manual git remote setup.
- **Priority email support** and a supporter mark in the About dialog.

BYOK AI (Ollama, Anthropic, OpenAI, Gemini, Claude Code, Codex, Gemini CLI) stays free forever. Pro users can still plug in their own keys *in addition to* their bundled credits.

### Explicitly deferred to v0.5.1

Not in the v0.5 launch — they'd stretch the timeline to 10+ weeks and delay revenue. Shipped as a fast-follow ~2 weeks after v0.5:

- **Publish** (one-command deploy a vault to `username.typex.site`, custom domain, RSS feed, per-post analytics) — this is the viral hook; it deserves its own launch moment.

### Scope breakdown

**Weeks 1–2 — server foundation**
- New Rust or Node service on the existing VPS (api.amptis.com or similar subdomain)
- SQLite tables: `users`, `sessions`, `subscriptions`, `github_tokens`
- Magic-link sign-in via Resend (no passwords, ever)
- Stripe subscription webhook
- `GET /me` — returns tier, credits remaining, feature flags
- `POST /ai/complete` — proxies to MiniMax, deducts credits, streams back
- `POST /backup/push` — writes an encrypted tarball to Cloudflare R2
- `POST /github/device` — GitHub device-flow auth
- R2 bucket for backup blobs

**Weeks 2–3 — client plumbing**
- Sign-in UI (email input → "check your inbox" state)
- Session token in OS keychain (reuses the `keyring` crate)
- Entitlements cache (30-day offline grace)
- Paywall modal for gated features ("This is a Pro feature — $8/mo. [Upgrade]")
- Pricing page on the landing (amptis.com/typex/pricing)
- "Pro" badge + credit counter in status bar

**Weeks 3–4 — the four paid features**
- `typex-cloud` provider in `src/ai/providers/` (hits our server, runs MiniMax)
- Theme editor UI + gate the existing `.typex/themes/*.css` loader
- GitHub OAuth flow + inline `#pr` references + Actions status widget
- Cloud backup auto-push on save, "Restore" palette command

**Weeks 5–6 — polish + onboarding**
- Zero-ceremony first run (kill the vault dialog, pre-load welcome.md)
- Terminology pass (remove "vault", land "folder" everywhere)
- Anti-plugin marketing copy on the landing + README
- Export themes (four print-ready CSS variants, wired to Pandoc)
- Migration notice for v0.4 users: "Upgrade to v0.5 → existing settings preserved, Pro optional"

**Week 7 — launch**
- Hacker News post: "Typora's successor, actively shipped, with AI"
- r/MarkdownEditors, r/writing, r/productivity posts
- Blog post comparison: "I switched from Obsidian to TypeX after a year with 40 plugins"
- Email existing v0.4 users (if we have any emails from issues / PRs) with a free-lifetime Pro offer as a thank-you
- Product Hunt launch prep (queue for week 8)

### Risks

- **MiniMax quality for prose.** We've speced MiniMax because it's cheap. If it produces worse ghost text than Claude/GPT, Pro users churn. Mitigation: evaluate output quality in week 3 before shipping; have a fallback path to OpenRouter-cheap models if MiniMax doesn't clear the bar.
- **MiniMax data policy.** Some users (US government adjacent, EU privacy-strict, legal / medical writers) won't send prose to a Chinese endpoint at any price. Mitigation: BYOK stays available in all tiers, advertised as the privacy-first option.
- **Stripe + European VAT.** If we take EU payments, Stripe Tax handles it, but we need to confirm our business entity is set up for it. Not optional.
- **Magic links → inbox issues.** Gmail / Outlook occasionally bin transactional email. Mitigation: SPF / DKIM / DMARC set up on the sending domain before launch.
- **Abuse vectors.** A free-tier signup shouldn't be able to spam MiniMax; credits only activate post-Stripe checkout. Rate-limit the sign-in endpoint.

### Done when

- A new user installs TypeX, opens it, starts writing within 5 seconds. No modal blocks them.
- A Pro user signs in once. From that moment: ghost text works, their themes sync, their vault backs up, their GitHub references light up. They never touch a key or a `git remote` command.
- At least one Typora refugee publicly says "I switched" on r/MarkdownEditors or Twitter within 2 weeks of launch.

***

## v1.0 — polish + Publish

**Target: +2–3 weeks after v0.5.** The release that ends active feature work.

- **Publish** — the deferred v0.5.1 feature. One-command deploy to `username.typex.site`, custom domain, per-post analytics, RSS feed, password-protected drafts. Included in a Pro Plus tier ($16/mo) or as a standalone $4/mo add-on.
- **Onboarding tour** (opt-in — the zero-ceremony first-run stays default, but a "Show me around" option in the welcome doc)
- **Accessibility audit** — full keyboard-only flow, screen-reader pass, WCAG AA contrast check
- **Pricing page refinement** — based on 30 days of real conversion data
- **Windows 10 EOL reminder** — Microsoft drops W10 support in late 2025; update docs to recommend W11

After v1.0: maintenance only. Bug fixes, vendor updates, security patches, community-requested small features. No scheduled v2.0 until the market tells us to build it.

***

## Pricing

| Tier | Price | Who it's for |
|---|---|---|
| **Free** | $0 | Local hermit. BYOK AI, manual git, two stock themes. TypeX v0.4 today, plus the zero-ceremony polish. |
| **Pro** | **$8/mo** · $72/yr | Connected writer. Everything in Free + bundled AI + themes + GitHub + backup + sync + support. |
| **Pro Plus** *(post-v1.0)* | **$16/mo** · $144/yr | Publisher. Everything in Pro + Publish hosting + custom domain + analytics. |
| **Lifetime** *(one-time, ~100 copies only)* | **$249** | Early-supporter loyalty tier. Pro forever. Credits still metered. Sold the week of v0.5 launch, then retired. |

**Free v0.4 users get a free-lifetime Pro license** as a thank-you when v0.5 ships. Generates goodwill, turns early adopters into advocates, blunts the "you went paid on us" backlash.

***

## Competitive stance — pick your fight

### vs Obsidian

**"For writing what you'll publish, not archiving what you've read."**

- Obsidian is a PKM / second-brain platform. Strength: infinite configurability via plugins. Weakness: configuring *is* the work.
- TypeX refuses plugins and refuses PKM. Graph view, canvas, daily notes, Dataview — none of them, forever. That's not a limitation; it's the product.
- Where we win: setup time (5 seconds vs. 40 minutes), WYSIWYG quality (real vs. Live Preview asterisks), git (first-party vs. flaky plugin), publish ($4/mo vs. $96/yr), install size (45 MB vs. 350 MB).
- Where Obsidian wins: community, ecosystem, mobile apps, graph-view marketing screenshot. We don't chase any of these.

### vs Typora

**"The spiritual successor, actively shipped."**

- Typora nailed the vibe in 2019, went paid in 2021, effectively stopped developing in 2022. Real audience is looking for the next thing.
- Where we match: WYSIWYG quality, focus mode, export breadth, editorial aesthetic.
- Where we beat them: active development, git, AI, publish, cross-device, Pro tier that pays for ongoing work.
- The message for r/typora and r/MarkdownEditors: *"Typora, maintained."*

### vs VS Code

**"For writing, not for code."**

Don't compete. Honestly redirect developers who write occasionally. TypeX is for people whose primary output is prose.

### vs iA Writer / Ulysses / Bear

- **iA Writer** is gorgeous but $29 per platform and no sync unless you bring iCloud. We're $8/mo with sync included; we win on price *and* feature breadth for serious writers.
- **Ulysses** is $40/yr, Apple-only, subscription-locked. We're Windows-first and cheaper.
- **Bear** is beautiful but Apple-only. Not overlapping markets.

***

## Never

Explicit non-goals. If a user asks for one of these, the answer is *"another tool is better at that; we won't build it here."*

- Graph view
- Canvas / whiteboard
- A plugin marketplace (no plugin API at all — features ship first-party or not at all)
- Daily notes / periodic notes workflow
- Dataview-style queries
- Mobile apps (desktop-first, deliberately; if users want to edit from phone, their git remote + GitHub's web editor is a fine stopgap)
- A Pro tier that exists to nag free users
- Telemetry beyond opt-in crash reporting (never, in any tier)
- Lock-in. Your vault stays plain Markdown on disk. If TypeX vanishes tomorrow, your writing opens in any editor written since 1970.

***

## Calendar

- **Q1 2026** — v0.1 → v0.3 (editor craft + git-native). Shipped.
- **Q2 2026** — v0.4 (AI for writing). Shipped.
- **Q2–Q3 2026** — v0.5 (paid tier launch, 6–7 weeks). In progress.
- **Q3 2026** — v1.0 (publish + polish, 2–3 weeks). Ends scheduled feature work.
- **Post-1.0** — maintenance, security patches, small user-requested features. No scheduled major release.

***

## The discipline test

Every feature request, at every stage, gets one question:

> *Does this make it easier for someone to open a folder and start writing — or harder?*

If harder, it's out. That's the knife that keeps us from becoming a second Obsidian.
