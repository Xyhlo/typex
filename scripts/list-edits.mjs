import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const IGNORE = new Set(["node_modules", ".git", "target", "dist", "bin", "obj"]);

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile()) out.push(full);
  }
  return out;
};

// 2026-04-18 11:21:00 America/New_York (EDT, UTC-4) = 2026-04-18 15:21:00 UTC
const cutoff = new Date("2026-04-18T15:21:00Z");

const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "numeric", minute: "2-digit", second: "2-digit",
  hour12: true, timeZoneName: "short",
});

const rows = walk(ROOT)
  .map((f) => ({
    p: path.relative(ROOT, f).replaceAll("\\", "/"),
    m: fs.statSync(f).mtime,
  }))
  .filter((r) => r.m < cutoff)
  .sort((a, b) => a.m - b.m);

console.log(`Files modified before 11:21 AM ET on 2026-04-18: ${rows.length}`);
console.log(`(cutoff: ${fmt.format(cutoff)})`);
console.log("");
for (const r of rows) {
  console.log(`${fmt.format(r.m).padEnd(34)}  ${r.p}`);
}
