/**
 * Generate the WiX MSI installer's branded bitmaps with no native deps —
 * just a small hand-rolled 24-bit BMP writer.
 *
 *   banner.bmp  — 493×58,  shown at the top of every wizard page
 *   dialog.bmp  — 493×312, shown on the left of Welcome + Exit pages
 *
 * Both are warm charcoal with the TypeX radial-indigo mark and a soft
 * accent glow, matching the Obsidian Ink palette used in the app.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "..", "src-tauri", "installer");

// ---------------- Color helpers ----------------
const hex = (s) => {
  const h = s.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
};

const mix = (c1, c2, t) => ({
  r: c1.r + (c2.r - c1.r) * t,
  g: c1.g + (c2.g - c1.g) * t,
  b: c1.b + (c2.b - c1.b) * t,
});

const clamp8 = (v) => Math.max(0, Math.min(255, Math.round(v)));

// ---------------- BMP writer (24-bit, bottom-up) ----------------
const makeBmp = (width, height, pixel) => {
  const rowBytes = width * 3;
  const padded = (rowBytes + 3) & ~3;
  const imageSize = padded * height;
  const fileSize = 54 + imageSize;
  const buf = Buffer.alloc(fileSize);
  let o = 0;

  // BITMAPFILEHEADER (14 bytes)
  buf.write("BM", o); o += 2;
  buf.writeUInt32LE(fileSize, o); o += 4;
  buf.writeUInt16LE(0, o); o += 2;
  buf.writeUInt16LE(0, o); o += 2;
  buf.writeUInt32LE(54, o); o += 4;

  // BITMAPINFOHEADER (40 bytes)
  buf.writeUInt32LE(40, o); o += 4;
  buf.writeInt32LE(width, o); o += 4;
  buf.writeInt32LE(height, o); o += 4;  // positive = bottom-up rows
  buf.writeUInt16LE(1, o); o += 2;
  buf.writeUInt16LE(24, o); o += 2;
  buf.writeUInt32LE(0, o); o += 4;
  buf.writeUInt32LE(imageSize, o); o += 4;
  buf.writeUInt32LE(2835, o); o += 4;   // ~72 DPI horizontal
  buf.writeUInt32LE(2835, o); o += 4;   // ~72 DPI vertical
  buf.writeUInt32LE(0, o); o += 4;
  buf.writeUInt32LE(0, o); o += 4;

  // Pixel data, bottom-up, BGR
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const c = pixel(x, y, width, height);
      buf[o++] = clamp8(c.b);
      buf[o++] = clamp8(c.g);
      buf[o++] = clamp8(c.r);
    }
    for (let p = rowBytes; p < padded; p++) buf[o++] = 0;
  }
  return buf;
};

// ---------------- Drawing primitives ----------------

// Rounded-square TypeX mark with radial indigo gradient (TypeX brand mark).
const drawMark = (x, y, cx, cy, size) => {
  const half = size * 0.5;
  const cornerR = size * 0.24;
  const dx = x - cx;
  const dy = y - cy;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);

  // Rounded-square SDF
  const dh = Math.max(adx - (half - cornerR), 0);
  const dv = Math.max(ady - (half - cornerR), 0);
  const cornerDist = Math.sqrt(dh * dh + dv * dv);
  const insideSquare = adx <= half && ady <= half;
  const insideCorner = cornerDist <= cornerR;
  if (!insideSquare || !insideCorner) return null;

  // Radial gradient: bright highlight at 30%/30% → base indigo → deeper at edges
  const nx = (dx + half) / size;
  const ny = (dy + half) / size;
  const highlightDist = Math.hypot(nx - 0.3, ny - 0.3) * 1.6;
  const edgeDist = cornerDist / cornerR; // 0..1 near corner edges

  const highlight = hex("#a89bff");
  const base = hex("#8b7cff");
  const deep = hex("#6656d6");

  const t1 = Math.min(1, highlightDist);
  const t2 = Math.max(0, (adx / half + ady / half) / 2 - 0.3);

  let c = mix(highlight, base, t1);
  c = mix(c, deep, Math.min(1, t2));

  // Subtle inner top-edge highlight
  if (dy < -half * 0.7 && Math.abs(dx) < half * 0.75) {
    const k = Math.max(0, (-dy - half * 0.7) / (half * 0.3));
    c = mix(c, hex("#ffffff"), 0.08 * k);
  }
  // Slight darker vignette near the bottom-right corner
  if (dx > half * 0.5 && dy > half * 0.5) {
    const k = Math.min(1, (dx + dy) / size);
    c = mix(c, hex("#3a2fa4"), 0.22 * k);
  }
  return c;
};

// Soft circular glow: returns { color, alpha } to composite over the base.
const glow = (x, y, cx, cy, radius, color, intensity) => {
  const d = Math.hypot(x - cx, y - cy);
  if (d >= radius) return null;
  const t = 1 - d / radius;
  return { color, alpha: t * t * intensity };
};

const composite = (base, layer) => {
  if (!layer) return base;
  return mix(base, layer.color, layer.alpha);
};

// ---------------- BANNER (493 × 58) ----------------
const banner = makeBmp(493, 58, (x, y, w, h) => {
  // Vertical gradient, slightly darker at the bottom
  const ty = y / h;
  let c = mix(hex("#141318"), hex("#0a090d"), ty);

  // Wide indigo bloom on the right side
  c = composite(c, glow(x, y, 460, 30, 280, hex("#8b7cff"), 0.12));
  // Smaller cool accent on the left around the mark
  c = composite(c, glow(x, y, 30, 29, 60, hex("#8b7cff"), 0.22));

  // Single-pixel accent line at the very bottom, faded toward edges
  if (y === h - 1) {
    const edge = Math.min(x, w - 1 - x) / 80;
    const fade = Math.min(1, edge);
    c = mix(c, hex("#8b7cff"), 0.28 * fade);
  }

  // The mark
  const m = drawMark(x, y, 30, 29, 34);
  if (m) c = m;

  return c;
});

// ---------------- DIALOG SIDE PANEL (493 × 312) ----------------
// WiX displays this to the LEFT of the Welcome / Exit dialogs.
// The right side of the image is hidden behind the text panel, but we still
// fill it with a smooth gradient so it blends if the user's DPI differs.
const dialog = makeBmp(493, 312, (x, y, w, h) => {
  // Diagonal warm-charcoal gradient, top-left deepest
  const dTL = Math.hypot(x / w, y / h);
  let c = mix(hex("#09080b"), hex("#1d1c24"), Math.min(1, dTL * 0.85));

  // Big soft halo behind the mark
  c = composite(c, glow(x, y, 82, 150, 170, hex("#8b7cff"), 0.32));
  // Secondary subtle tint spreading across the panel
  c = composite(c, glow(x, y, 220, 170, 260, hex("#8b7cff"), 0.05));

  // The mark — centered in the left column the wizard shows
  const m = drawMark(x, y, 82, 150, 88);
  if (m) c = m;

  // Thin indigo accent bar beneath the mark
  const barY = 202;
  const barH = 2;
  const barCX = 82;
  const barHalfLen = 34;
  if (y >= barY && y < barY + barH) {
    const along = Math.abs(x - barCX) / barHalfLen;
    if (along < 1) {
      const fade = 1 - along;
      c = mix(c, hex("#8b7cff"), 0.6 * fade);
    }
  }

  // Three dot markers further down — a little brand flourish
  const dotY = 220;
  for (let i = -1; i <= 1; i++) {
    const dx = x - (82 + i * 16);
    const dy = y - dotY;
    if (dx * dx + dy * dy <= 3 * 3) {
      c = mix(c, hex("#5b4de0"), 0.8);
    }
  }

  // Right-edge horizontal fadeout so blended text stays readable
  if (x > 164) {
    const k = (x - 164) / (w - 164);
    c = mix(c, hex("#141318"), Math.min(1, k * 1.2));
  }

  return c;
});

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "banner.bmp"), banner);
fs.writeFileSync(path.join(OUT_DIR, "dialog.bmp"), dialog);

console.log(`banner.bmp  ${banner.length.toLocaleString()} bytes`);
console.log(`dialog.bmp  ${dialog.length.toLocaleString()} bytes`);
console.log(`  → ${OUT_DIR}`);
