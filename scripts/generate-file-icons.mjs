/**
 * Generate per-extension file-type icons — a branded purple TypeX mark with
 * the extension label (DOCX, MD, EPUB, etc.) rendered over it in white.
 *
 * Output: src-tauri/icons/ext/ext-<ext>.ico  (multi-image ICO, 16→256 px)
 *
 * Pure Node — no image deps. Uses a hand-encoded 5x7 bitmap font so text
 * renders without a canvas library. Smaller sizes (< 64 px) drop the label
 * and render just the mark, matching how real OS icons downscale.
 *
 * NOTE: Tauri's MSI registers one shared app icon for all file
 * associations by default. To actually see these in Explorer we need a
 * WiX customization step (not done here). For now the assets are
 * generated and ready to wire up.
 */
import fs from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "..", "src-tauri", "icons", "ext");

// ------------- 5x7 uppercase bitmap font -------------
// # = filled, space = empty. 7 rows × 5 cols per glyph.
const FONT = {
  A: ["  #  ", " # # ", "#   #", "#   #", "#####", "#   #", "#   #"],
  B: ["#### ", "#   #", "#   #", "#### ", "#   #", "#   #", "#### "],
  C: [" ####", "#    ", "#    ", "#    ", "#    ", "#    ", " ####"],
  D: ["#### ", "#   #", "#   #", "#   #", "#   #", "#   #", "#### "],
  E: ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#####"],
  F: ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#    "],
  G: [" ####", "#    ", "#    ", "#  ##", "#   #", "#   #", " ####"],
  H: ["#   #", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
  I: ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "#####"],
  J: ["#####", "    #", "    #", "    #", "    #", "#   #", " ### "],
  K: ["#   #", "#  # ", "# #  ", "##   ", "# #  ", "#  # ", "#   #"],
  L: ["#    ", "#    ", "#    ", "#    ", "#    ", "#    ", "#####"],
  M: ["#   #", "## ##", "# # #", "# # #", "#   #", "#   #", "#   #"],
  N: ["#   #", "##  #", "# # #", "# # #", "# # #", "#  ##", "#   #"],
  O: [" ### ", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
  P: ["#### ", "#   #", "#   #", "#### ", "#    ", "#    ", "#    "],
  Q: [" ### ", "#   #", "#   #", "#   #", "# # #", "#  # ", " ## #"],
  R: ["#### ", "#   #", "#   #", "#### ", "# #  ", "#  # ", "#   #"],
  S: [" ####", "#    ", "#    ", " ### ", "    #", "    #", "#### "],
  T: ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  "],
  U: ["#   #", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
  V: ["#   #", "#   #", "#   #", "#   #", "#   #", " # # ", "  #  "],
  W: ["#   #", "#   #", "#   #", "# # #", "# # #", "## ##", "#   #"],
  X: ["#   #", "#   #", " # # ", "  #  ", " # # ", "#   #", "#   #"],
  Y: ["#   #", "#   #", " # # ", "  #  ", "  #  ", "  #  ", "  #  "],
  Z: ["#####", "    #", "   # ", "  #  ", " #   ", "#    ", "#####"],
  "0": [" ### ", "#   #", "#  ##", "# # #", "##  #", "#   #", " ### "],
  "1": ["  #  ", " ##  ", "# #  ", "  #  ", "  #  ", "  #  ", "#####"],
  "2": [" ### ", "#   #", "    #", "   # ", "  #  ", " #   ", "#####"],
  "3": ["#### ", "    #", "    #", " ### ", "    #", "    #", "#### "],
  "4": ["#   #", "#   #", "#   #", "#####", "    #", "    #", "    #"],
  "5": ["#####", "#    ", "#    ", "#### ", "    #", "    #", "#### "],
  "6": [" ### ", "#    ", "#    ", "#### ", "#   #", "#   #", " ### "],
  "7": ["#####", "    #", "   # ", "  #  ", " #   ", "#    ", "#    "],
  "8": [" ### ", "#   #", "#   #", " ### ", "#   #", "#   #", " ### "],
  "9": [" ### ", "#   #", "#   #", " ####", "    #", "    #", " ### "],
  "?": [" ### ", "#   #", "    #", "   # ", "  #  ", "     ", "  #  "],
};

// ------------- PNG encoder (24-bit RGBA) -------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
};
const makePng = (w, h, pixel) => {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 4);
    for (let x = 0; x < w; x++) {
      const c = pixel(x, y);
      row[1 + x * 4 + 0] = c.r | 0;
      row[1 + x * 4 + 1] = c.g | 0;
      row[1 + x * 4 + 2] = c.b | 0;
      row[1 + x * 4 + 3] = c.a | 0;
    }
    rows.push(row);
  }
  const idat = deflateSync(Buffer.concat(rows));
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

// ------------- Multi-image ICO writer -------------
const makeIco = (pngsBySize) => {
  const entries = Object.entries(pngsBySize)
    .map(([sz, png]) => ({ size: Number(sz), png }))
    .sort((a, b) => a.size - b.size);

  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0);                  // reserved
  dir.writeUInt16LE(1, 2);                  // type = icon
  dir.writeUInt16LE(entries.length, 4);     // count

  let offset = 6 + 16 * entries.length;
  const dirEntries = [];
  for (const { size, png } of entries) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;   // width (0 = 256)
    e[1] = size >= 256 ? 0 : size;   // height
    e[2] = 0;                         // color-palette count (0 for 32bpp)
    e[3] = 0;                         // reserved
    e.writeUInt16LE(1, 4);            // planes
    e.writeUInt16LE(32, 6);           // bits per pixel
    e.writeUInt32LE(png.length, 8);   // image size in bytes
    e.writeUInt32LE(offset, 12);      // image offset from file start
    offset += png.length;
    dirEntries.push(e);
  }
  return Buffer.concat([dir, ...dirEntries, ...entries.map((e) => e.png)]);
};

// ------------- Drawing helpers -------------
const lerp = (a, b, t) => a + (b - a) * t;

// Pre-compute text mask for an icon of given size + label + font-scale.
const textMask = (size, label, scale) => {
  if (!label || scale <= 0) return null;
  const letterW = 5 * scale;
  const gap = scale;
  const totalW = label.length * letterW + (label.length - 1) * gap;
  if (totalW > size - 12) return null; // won't fit with margin
  const bandHeight = Math.floor(size * 0.38);
  const textX = Math.floor((size - totalW) / 2);
  const textY = Math.floor(
    size - bandHeight + (bandHeight - 7 * scale) / 2,
  );
  const mask = new Uint8Array(size * size);

  for (let i = 0; i < label.length; i++) {
    const glyph = FONT[label[i]] || FONT["?"];
    const baseX = textX + i * (letterW + gap);
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] !== "#") continue;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const px = baseX + col * scale + dx;
            const py = textY + row * scale + dy;
            if (px >= 0 && px < size && py >= 0 && py < size) {
              mask[py * size + px] = 1;
            }
          }
        }
      }
    }
  }
  return mask;
};

// Rendered pixel for a given (x, y) on an icon of given size + label.
const pixelForIcon = (size, label, tmask) => (x, y) => {
  const half = size / 2 - 0.5;
  const cornerR = size * 0.22;
  const dx = Math.abs(x - size / 2);
  const dy = Math.abs(y - size / 2);
  const dh = Math.max(dx - (half - cornerR), 0);
  const dv = Math.max(dy - (half - cornerR), 0);
  const cornerDist = Math.sqrt(dh * dh + dv * dv);
  if (dx > half || dy > half || cornerDist > cornerR) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  // White text on top
  if (tmask && tmask[y * size + x]) {
    return { r: 255, g: 255, b: 255, a: 255 };
  }

  // Radial gradient background
  const nx = x / size;
  const ny = y / size;
  const t = Math.min(1, Math.hypot(nx - 0.3, ny - 0.3) / 0.9);

  // Two-stop gradient: #a89bff → #8b7cff (0.5) → #6656d6 (1.0)
  let r, g, b;
  if (t < 0.5) {
    const tt = t / 0.5;
    r = lerp(0xa8, 0x8b, tt);
    g = lerp(0x9b, 0x7c, tt);
    b = lerp(0xff, 0xff, tt);
  } else {
    const tt = (t - 0.5) / 0.5;
    r = lerp(0x8b, 0x66, tt);
    g = lerp(0x7c, 0x56, tt);
    b = lerp(0xff, 0xd6, tt);
  }

  // Subtle darkened band at the bottom to help the label read
  if (label && y > size - Math.floor(size * 0.38)) {
    const band = Math.floor(size * 0.38);
    const k = (y - (size - band)) / band;
    r *= 1 - 0.18 * k;
    g *= 1 - 0.18 * k;
    b *= 1 - 0.18 * k;
  }

  // Inner top highlight
  const top = size * 0.22;
  if (y < top) {
    const k = Math.max(0, (top - y) / top);
    r = lerp(r, 255, 0.06 * k);
    g = lerp(g, 255, 0.06 * k);
    b = lerp(b, 255, 0.06 * k);
  }

  return { r, g, b, a: 255 };
};

// Pick the largest font scale that fits for each icon size.
const pickScale = (size, labelLen) => {
  if (size < 64) return 0;
  // Reserve 12 px margin horizontally.
  const maxLetterW = (size - 12 - (labelLen - 1) * 2) / labelLen;
  const maxScale = Math.floor(maxLetterW / 5);
  if (maxScale < 1) return 0;
  if (size >= 256) return Math.min(maxScale, 10);
  if (size >= 128) return Math.min(maxScale, 5);
  if (size >= 64) return Math.min(maxScale, 3);
  return Math.min(maxScale, 2);
};

const ICON_SIZES = [16, 32, 48, 64, 128, 256];

const renderIcon = (size, label) => {
  const shouldLabel = size >= 64 && label;
  const scale = shouldLabel ? pickScale(size, label.length) : 0;
  const mask = scale > 0 ? textMask(size, label, scale) : null;
  const displayLabel = mask ? label : null;
  return makePng(size, size, pixelForIcon(size, displayLabel, mask));
};

// ------------- The extensions we ship ------------
//
// Label → list of extensions that share this visual. When Explorer shows a
// file with one of these extensions, the icon is the TypeX mark with that
// label painted at the bottom.
const ICONS = [
  { label: "MD",    exts: ["md", "markdown", "mdx"] },
  { label: "TXT",   exts: ["txt"] },
  { label: "DOCX",  exts: ["docx"] },
  { label: "ODT",   exts: ["odt"] },
  { label: "RTF",   exts: ["rtf"] },
  { label: "HTML",  exts: ["html", "htm"] },
  { label: "EPUB",  exts: ["epub"] },
  { label: "RST",   exts: ["rst"] },
  { label: "ADOC",  exts: ["adoc", "asciidoc"] },
  { label: "TEX",   exts: ["tex", "latex"] },
  { label: "ORG",   exts: ["org"] },
  { label: "TXTL",  exts: ["textile"] },
  { label: "WIKI",  exts: ["wiki", "mediawiki"] },
  { label: "MUSE",  exts: ["muse"] },
  { label: "T2T",   exts: ["t2t"] },
  { label: "IPYNB", exts: ["ipynb"] },
  { label: "BIB",   exts: ["bib"] },
  { label: "FB2",   exts: ["fb2"] },
  { label: "OPML",  exts: ["opml"] },
  { label: "MAN",   exts: ["man"] },
];

// ------------- Go -------------
fs.mkdirSync(OUT_DIR, { recursive: true });

let totalExts = 0;
for (const { label, exts } of ICONS) {
  const pngs = {};
  for (const size of ICON_SIZES) {
    pngs[size] = renderIcon(size, label.toUpperCase());
  }
  const ico = makeIco(pngs);
  for (const ext of exts) {
    const out = path.join(OUT_DIR, `ext-${ext}.ico`);
    fs.writeFileSync(out, ico);
    totalExts += 1;
  }
  console.log(`${label.padEnd(6)} → ${exts.map((e) => "." + e).join(", ")}`);
}

console.log(
  `\n${ICONS.length} icon designs covering ${totalExts} extensions.`,
);
console.log(`Output: ${OUT_DIR}`);
