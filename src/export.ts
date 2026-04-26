/**
 * Exports the current document to a self-contained HTML file with embedded
 * theme styles so it renders standalone in a browser.
 */
import { saveAsDialog, saveFile, isTauri } from "./fs/files";

const STYLE_BLOCK = `
:root {
  --bg: #fbfaf6;
  --fg: #1c1b22;
  --fg-heading: #0e0d13;
  --fg-muted: #5a5863;
  --accent: #5b4de0;
  --border: rgba(28,26,32,0.09);
  --code-bg: #f3efe4;
  --code-bg-inline: rgba(91,77,224,0.1);
  --code-fg: #2a2830;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #17161c;
    --fg: #ebe7dd;
    --fg-heading: #f6f3ea;
    --fg-muted: #a6a1a9;
    --accent: #8b7cff;
    --border: rgba(255,255,255,0.09);
    --code-bg: #1a1921;
    --code-bg-inline: rgba(139,124,255,0.12);
    --code-fg: #e0dcd2;
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--fg); }
body {
  font-family: -apple-system, "Segoe UI", Inter, sans-serif;
  font-size: 16.5px;
  line-height: 1.75;
  padding: 4rem 2rem;
}
main { max-width: 72ch; margin: 0 auto; }
h1,h2,h3,h4,h5,h6 {
  color: var(--fg-heading);
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: -0.014em;
  margin: 2em 0 0.5em;
}
h1 { font-size: 2.2rem; font-weight: 700; letter-spacing: -0.02em; }
h1::after {
  content: ""; display: block; margin-top: 0.4rem;
  width: 2rem; height: 2px; background: linear-gradient(90deg, var(--accent), transparent);
  border-radius: 2px;
}
h2 { font-size: 1.65rem; }
h3 { font-size: 1.32rem; }
h6 {
  font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.04em;
  color: var(--fg-muted);
}
p { margin: 0 0 0.8rem; }
a { color: var(--accent); text-decoration: none; border-bottom: 1px solid var(--accent); }
a:hover { border-bottom-width: 2px; }
strong { color: var(--fg-heading); font-weight: 600; }
code {
  font-family: "JetBrains Mono", ui-monospace, "Cascadia Code", monospace;
  font-size: 0.88em;
  padding: 0.15em 0.42em;
  background: var(--code-bg-inline);
  border-radius: 3px;
}
pre {
  background: var(--code-bg);
  color: var(--code-fg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1rem 1.2rem;
  overflow: auto;
  line-height: 1.6;
  margin: 1rem 0;
}
pre code { background: none; padding: 0; }
blockquote {
  margin: 0;
  padding: 0.6rem 1.2rem;
  border-left: 3px solid var(--accent);
  background: rgba(91,77,224,0.04);
  border-radius: 0 6px 6px 0;
  color: var(--fg-muted);
  font-style: italic;
}
hr {
  border: 0; height: 1px; margin: 2.2rem auto;
  background: linear-gradient(90deg, transparent, var(--border), transparent);
  width: 50%;
}
table {
  width: 100%; border-collapse: collapse; margin: 1rem 0;
  box-shadow: 0 0 0 1px var(--border); border-radius: 6px;
}
th, td { padding: 10px 14px; border-bottom: 1px solid var(--border); text-align: left; }
th { background: rgba(0,0,0,0.03); font-weight: 600; font-size: 0.88rem; text-transform: uppercase; letter-spacing: 0.04em; }
img { max-width: 100%; border-radius: 8px; }
ul, ol { padding-left: 1.6em; }
li { margin-top: 0.2rem; }
`;

export const buildHtmlDocument = (
  title: string,
  innerHTML: string,
): string => {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>${STYLE_BLOCK}</style>
</head>
<body>
<main>
${innerHTML}
</main>
</body>
</html>`;
};

export const exportAsHtml = async (
  title: string,
  innerHTML: string,
  suggestedName = "document.html",
): Promise<boolean> => {
  if (!isTauri()) return false;
  const file = await saveAsDialog(
    suggestedName.endsWith(".html") ? suggestedName : `${suggestedName}.html`,
    [
      { name: "HTML", extensions: ["html", "htm"] },
      { name: "All files", extensions: ["*"] },
    ],
  );
  if (!file) return false;
  const target = file.endsWith(".html") ? file : `${file}.html`;
  await saveFile(target, buildHtmlDocument(title, innerHTML));
  return true;
};

const escapeHtml = (s: string): string =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
