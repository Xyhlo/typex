/**
 * Generate placeholder app icons for Tauri.
 * Creates a radial-gradient indigo icon (TypeX brand) at the sizes Tauri expects.
 * Replace these with your own artwork for release builds.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICON_DIR = resolve(__dirname, "../src-tauri/icons");

// CRC32 for PNG chunks
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const pngChunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
};

const makePng = (w, h, pixel) => {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 4); // filter byte + RGBA
    for (let x = 0; x < w; x++) {
      const { r, g, b, a } = pixel(x, y, w, h);
      row[1 + x * 4] = r;
      row[2 + x * 4] = g;
      row[3 + x * 4] = b;
      row[4 + x * 4] = a;
    }
    rows.push(row);
  }
  const idat = deflateSync(Buffer.concat(rows));
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
};

// Brand: radial indigo gradient with a rounded "T" glyph.
// Colors: center #9d90ff, edge #5b4de0, background transparent outside mask.
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
const mix = (c1, c2, t) => ({
  r: lerp(c1.r, c2.r, t),
  g: lerp(c1.g, c2.g, t),
  b: lerp(c1.b, c2.b, t),
  a: 255,
});

const brand = (x, y, w, h) => {
  const cx = w * 0.5, cy = h * 0.5;
  const radius = Math.min(w, h) * 0.46;
  const cornerR = Math.min(w, h) * 0.22;

  // Rounded-square mask
  const dx = Math.abs(x - cx);
  const dy = Math.abs(y - cy);
  const halfInner = radius;
  const px = Math.max(dx - (halfInner - cornerR), 0);
  const py = Math.max(dy - (halfInner - cornerR), 0);
  const inSquare = (dx <= halfInner && dy <= halfInner) &&
    (px * px + py * py <= cornerR * cornerR);
  if (!inSquare) return { r: 0, g: 0, b: 0, a: 0 };

  // Gradient background
  const distFromCenter = Math.sqrt((x - cx * 0.8) ** 2 + (y - cy * 0.8) ** 2);
  const t = Math.min(1, distFromCenter / (Math.min(w, h) * 0.7));
  const bg = mix({ r: 0x9d, g: 0x90, b: 0xff }, { r: 0x5b, g: 0x4d, b: 0xe0 }, t);

  // "T" glyph — horizontal top bar + vertical stem
  const glyphW = radius * 0.9;
  const glyphH = radius * 1.05;
  const gx1 = cx - glyphW * 0.5, gx2 = cx + glyphW * 0.5;
  const gy1 = cy - glyphH * 0.5, gy2 = cy + glyphH * 0.5;
  const barH = glyphH * 0.18;
  const stemW = glyphW * 0.2;

  const inBar = y >= gy1 && y <= gy1 + barH && x >= gx1 && x <= gx2;
  const inStem = x >= cx - stemW * 0.5 && x <= cx + stemW * 0.5 && y >= gy1 && y <= gy2;
  if (inBar || inStem) {
    // Soft cream glyph
    return { r: 0xfb, g: 0xfa, b: 0xf6, a: 255 };
  }
  return bg;
};

const writeIcon = (name, size) => {
  const buf = makePng(size, size, brand);
  const path = resolve(ICON_DIR, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
  return { path, size: buf.length };
};

// Single-image ICO wrapper (PNG inside), which Windows accepts
const writeIco = (name, size) => {
  const png = makePng(size, size, brand);
  // ICONDIR (6 bytes)
  const iconDir = Buffer.alloc(6);
  iconDir.writeUInt16LE(0, 0);    // reserved
  iconDir.writeUInt16LE(1, 2);    // type (1 = icon)
  iconDir.writeUInt16LE(1, 4);    // count
  // ICONDIRENTRY (16 bytes)
  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size;   // width (0 = 256)
  entry[1] = size >= 256 ? 0 : size;   // height
  entry[2] = 0;                        // colors in palette
  entry[3] = 0;                        // reserved
  entry.writeUInt16LE(1, 4);           // color planes
  entry.writeUInt16LE(32, 6);          // bits per pixel
  entry.writeUInt32LE(png.length, 8);  // image size
  entry.writeUInt32LE(22, 12);         // image offset (6 + 16)
  const buf = Buffer.concat([iconDir, entry, png]);
  const path = resolve(ICON_DIR, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
  return { path, size: buf.length };
};

// Minimal ICNS wrapper — single PNG entry at 128px (type "ic07" = 128x128 PNG)
const writeIcns = (name, size) => {
  const png = makePng(size, size, brand);
  const icnsHeader = Buffer.alloc(8);
  icnsHeader.write("icns", 0, "ascii");
  // size includes header + entry header (8) + png
  const entryHeader = Buffer.alloc(8);
  entryHeader.write("ic07", 0, "ascii");
  entryHeader.writeUInt32BE(8 + png.length, 4);
  icnsHeader.writeUInt32BE(8 + 8 + png.length, 4);
  const buf = Buffer.concat([icnsHeader, entryHeader, png]);
  const path = resolve(ICON_DIR, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
  return { path, size: buf.length };
};

mkdirSync(ICON_DIR, { recursive: true });

const outputs = [
  writeIcon("32x32.png", 32),
  writeIcon("128x128.png", 128),
  writeIcon("128x128@2x.png", 256),
  writeIcns("icon.icns", 128),
  writeIco("icon.ico", 64),
];

for (const o of outputs) {
  console.log(`wrote ${o.path} (${o.size} bytes)`);
}
