/**
 * Downloads the latest Pandoc release for the current host and places it at
 *   src-tauri/binaries/pandoc-<target-triple>[.exe]
 * so Tauri's `externalBin` picks it up as a sidecar binary in the installer.
 *
 * Usage: `node scripts/fetch-pandoc.mjs`
 */
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BIN_DIR = path.join(ROOT, "src-tauri", "binaries");

const UA = { "User-Agent": "typex-fetch-pandoc" };

const tripleFor = (plat, arch) => {
  if (plat === "win32" && arch === "x64") return "x86_64-pc-windows-msvc";
  if (plat === "win32" && arch === "arm64") return "aarch64-pc-windows-msvc";
  if (plat === "darwin" && arch === "arm64") return "aarch64-apple-darwin";
  if (plat === "darwin" && arch === "x64") return "x86_64-apple-darwin";
  if (plat === "linux" && arch === "x64") return "x86_64-unknown-linux-gnu";
  if (plat === "linux" && arch === "arm64") return "aarch64-unknown-linux-gnu";
  throw new Error(`Unsupported host: ${plat}/${arch}`);
};

const pickAsset = (assets, plat, arch) => {
  const match = (re) => assets.find((a) => re.test(a.name));
  if (plat === "win32" && arch === "x64") return match(/windows-x86_64\.zip$/i);
  if (plat === "win32" && arch === "arm64") return match(/windows-arm64\.zip$/i);
  if (plat === "darwin" && arch === "arm64") {
    return match(/arm64-macOS\.zip$/i) || match(/macOS\.zip$/i);
  }
  if (plat === "darwin" && arch === "x64") {
    return match(/x86_64-macOS\.zip$/i) || match(/macOS\.zip$/i);
  }
  if (plat === "linux" && arch === "x64") return match(/linux-amd64\.tar\.gz$/i);
  if (plat === "linux" && arch === "arm64") return match(/linux-arm64\.tar\.gz$/i);
  return null;
};

const get = (url, opts = {}) =>
  new Promise((resolve, reject) => {
    https
      .get(url, { headers: UA, ...opts }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(get(res.headers.location, opts));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        resolve(res);
      })
      .on("error", reject);
  });

const fetchJson = async (url) => {
  const res = await get(url);
  const chunks = [];
  for await (const c of res) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

const downloadTo = async (url, destPath) => {
  const res = await get(url);
  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    res.pipe(file);
    file.on("finish", () => file.close(resolve));
    file.on("error", reject);
  });
};

const extractArchive = (archivePath, destDir) => {
  // Windows' system tar (bsdtar) handles both .zip and .tar.gz.
  // We call it by absolute path on Windows so we don't shadow it with a
  // Git-Bash/MSYS2 tar, which misinterprets C: drive letters as remote hosts.
  const tarBin =
    process.platform === "win32"
      ? "C:\\Windows\\System32\\tar.exe"
      : "tar";
  const r = spawnSync(tarBin, ["-xf", archivePath, "-C", destDir], {
    stdio: "inherit",
  });
  if (r.status !== 0) throw new Error("tar extraction failed");
};

const findPandocIn = (dir) => {
  const want = process.platform === "win32" ? "pandoc.exe" : "pandoc";
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name === want) return full;
    }
  }
  return null;
};

const main = async () => {
  const plat = process.platform;
  const arch = process.arch;
  const triple = tripleFor(plat, arch);
  const exeSuffix = plat === "win32" ? ".exe" : "";
  const targetName = `pandoc-${triple}${exeSuffix}`;
  const targetPath = path.join(BIN_DIR, targetName);

  if (fs.existsSync(targetPath)) {
    console.log(`Pandoc already bundled: ${targetPath}`);
    console.log(`Delete it to force re-download.`);
    return;
  }

  console.log("Fetching latest Pandoc release info…");
  const release = await fetchJson(
    "https://api.github.com/repos/jgm/pandoc/releases/latest",
  );
  console.log(`Latest: ${release.tag_name}`);

  const asset = pickAsset(release.assets ?? [], plat, arch);
  if (!asset) {
    throw new Error(`No Pandoc asset for ${plat}/${arch} in ${release.tag_name}`);
  }
  console.log(`Downloading ${asset.name} (${Math.round(asset.size / 1024 / 1024)} MB)…`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "typex-pandoc-"));
  const zipPath = path.join(tmpDir, asset.name);
  await downloadTo(asset.browser_download_url, zipPath);
  console.log("Download complete. Extracting…");

  const extractDir = path.join(tmpDir, "extract");
  fs.mkdirSync(extractDir, { recursive: true });
  extractArchive(zipPath, extractDir);

  const located = findPandocIn(extractDir);
  if (!located) {
    throw new Error("Couldn't find pandoc binary in extracted archive");
  }

  fs.mkdirSync(BIN_DIR, { recursive: true });
  fs.copyFileSync(located, targetPath);
  if (plat !== "win32") fs.chmodSync(targetPath, 0o755);

  // Best-effort cleanup
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  const sizeMb = (fs.statSync(targetPath).size / 1024 / 1024).toFixed(1);
  console.log(`\nBundled Pandoc ${release.tag_name}: ${targetPath} (${sizeMb} MB)`);
  console.log(`Ready for 'npm run tauri:build'.`);
};

main().catch((err) => {
  console.error(`fetch-pandoc failed: ${err.message}`);
  process.exit(1);
});
