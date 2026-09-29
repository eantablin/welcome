// Generates PWA icons for all three games (white paper, black ink).
// Pure Node + zlib — no image deps. Run: node scripts/make-game-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── drawing helpers ────────────────────────────────────────────────────
const WHITE = 0xffffff, BLACK = 0x000000;

function makeCanvas(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    rgba[i] = (c >> 16) & 0xff; rgba[i + 1] = (c >> 8) & 0xff; rgba[i + 2] = c & 0xff; rgba[i + 3] = 255;
  };
  const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, c); };
  const line = (x0, y0, x1, y1, c, thickness = 1) => {
    // Bresenham with thickness square brush
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, x = x0, y = y0;
    for (;;) {
      const half = Math.floor(thickness / 2);
      for (let j = -half; j <= half; j++) for (let i = -half; i <= half; i++) set(x + i, y + j, c);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  };
  return { rgba, set, rect, line };
}

// 5x7 bitmap digits, rows LSB-top. "1" and "2" suffice for "21".
const DIGITS = {
  1: ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  2: [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
};

function drawGlyphs(canvas, text, size, m, scale, color = BLACK) {
  const glyphW = 5 * scale;
  const gap = scale;
  const totalW = text.length * glyphW + (text.length - 1) * gap;
  let x0 = Math.round((size - totalW) / 2);
  const y0 = Math.round((size - 7 * scale) / 2);
  for (const ch of text) {
    const rows = DIGITS[ch];
    if (!rows) { x0 += glyphW + gap; continue; }
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 5; c++)
        if (rows[r][c] === "#") canvas.rect(x0 + c * scale, y0 + r * scale, scale, scale, color);
    x0 += glyphW + gap;
  }
}

function frame(canvas, size, m, frameW) {
  canvas.rect(m, m, size - 2 * m, frameW, BLACK);                          // top
  canvas.rect(m, size - m - frameW, size - 2 * m, frameW, BLACK);          // bottom
  canvas.rect(m, m, frameW, size - 2 * m, BLACK);                          // left
  canvas.rect(size - m - frameW, m, frameW, size - 2 * m, BLACK);          // right
}

// ── per-game content ───────────────────────────────────────────────────

// flappy: frame + square bird with eye + beak notch
function drawBird(size, maskable) {
  const canvas = makeCanvas(size);
  const m = maskable ? Math.round(size * 0.1) : Math.round(size * 0.04);
  const inner = size - m * 2;
  const frameW = Math.max(2, Math.round(inner * 0.055));
  canvas.rect(0, 0, size, size, WHITE);
  frame(canvas, size, m, frameW);

  const birdSize = Math.round(inner * 0.42);
  const bx = Math.round((size - birdSize) / 2);
  const by = Math.round((size - birdSize) / 2);
  canvas.rect(bx, by, birdSize, birdSize, BLACK);
  // eye (white)
  const eye = Math.max(3, Math.round(birdSize * 0.16));
  canvas.rect(bx + Math.round(birdSize * 0.55), by + Math.round(birdSize * 0.2), eye, eye, WHITE);
  // beak notch
  canvas.rect(bx + birdSize, by + Math.round(birdSize * 0.45), Math.round(birdSize * 0.12), Math.max(3, Math.round(birdSize * 0.12)), BLACK);
  return canvas;
}

// blackjack: frame + big "21" digits over a card outline
function drawBlackjack(size, maskable) {
  const canvas = makeCanvas(size);
  const m = maskable ? Math.round(size * 0.1) : Math.round(size * 0.05);
  const inner = size - m * 2;
  const frameW = Math.max(2, Math.round(inner * 0.055));
  canvas.rect(0, 0, size, size, WHITE);
  frame(canvas, size, m, frameW);

  // "21" digits, upper area
  const scale = Math.max(3, Math.round(size * 0.06));
  const glyphH = 7 * scale;
  const topPad = Math.round(size * 0.11);
  // drawGlyphs centers vertically; shift digits up by drawing into a clipped canvas
  const digits = makeCanvas(size);
  drawGlyphs(digits, "21", size, m, scale, BLACK);
  // copy only the top band (rows topPad .. topPad + glyphH)
  for (let y = topPad; y < Math.min(size, topPad + glyphH); y++)
    for (let x = m; x < size - m; x++) {
      const i = (y * size + x) * 4;
      if (digits.rgba[i + 3] > 0 && digits.rgba[i] === 0) canvas.set(x, y, BLACK);
    }

  // card below: black-filled card with white pip
  const cardW = Math.round(inner * 0.3);
  const cardH = Math.round(cardW * 1.35);
  const cx = Math.round((size - cardW) / 2);
  const cy = Math.round(size * 0.56);
  canvas.rect(cx, cy, cardW, cardH, BLACK);
  const pip = Math.max(3, Math.round(cardW * 0.2));
  canvas.rect(cx + Math.round((cardW - pip) / 2), cy + Math.round(cardH * 0.2), pip, pip, WHITE);
  return canvas;
}

// tictactoe: frame + 3x3 grid with a big X in the center cell
function drawTicTacToe(size, maskable) {
  const canvas = makeCanvas(size);
  const m = maskable ? Math.round(size * 0.1) : Math.round(size * 0.05);
  const inner = size - m * 2;
  const frameW = Math.max(2, Math.round(inner * 0.05));
  canvas.rect(0, 0, size, size, WHITE);
  frame(canvas, size, m, frameW);

  // grid
  const g0 = m + frameW + Math.round(inner * 0.04); // grid area start
  const gSize = size - g0 * 2 + m * 0;              // grid square side
  const cell = Math.round(gSize / 3);
  const lw = Math.max(2, Math.round(size * 0.025));
  canvas.line(g0 + cell, g0, g0 + cell, g0 + gSize, BLACK, lw);
  canvas.line(g0 + 2 * cell, g0, g0 + 2 * cell, g0 + gSize, BLACK, lw);
  canvas.line(g0, g0 + cell, g0 + gSize, g0 + cell, BLACK, lw);
  canvas.line(g0, g0 + 2 * cell, g0 + gSize, g0 + 2 * cell, BLACK, lw);

  // X in center cell (two diagonals)
  const pad = Math.round(cell * 0.28);
  const x0 = g0 + cell + pad, x1 = g0 + 2 * cell - pad;
  const y0 = g0 + cell + pad, y1 = g0 + 2 * cell - pad;
  const xw = Math.max(2, Math.round(size * 0.035));
  canvas.line(x0, y0, x1, y1, BLACK, xw);
  canvas.line(x0, y1, x1, y0, BLACK, xw);
  return canvas;
}

// ── emit ───────────────────────────────────────────────────────────────
const GAMES = [
  { dir: "public/games", draw: drawBird },
  { dir: "public/blackjack", draw: drawBlackjack },
  { dir: "public/tictactoe", draw: drawTicTacToe },
];

for (const { dir, draw } of GAMES) {
  const out = join(root, dir, "icons");
  mkdirSync(out, { recursive: true });
  for (const [name, size, maskable] of [
    ["icon-180.png", 180, false],
    ["icon-192.png", 192, false],
    ["icon-512.png", 512, false],
    ["icon-maskable-192.png", 192, true],
    ["icon-maskable-512.png", 512, true],
  ]) {
    const canvas = draw(size, maskable);
    writeFileSync(join(out, name), png(size, size, canvas.rgba));
  }
  console.log("icons →", dir);
}
