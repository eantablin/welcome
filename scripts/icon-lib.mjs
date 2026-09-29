// Shared icon-drawing helpers for all game PWAs.
// Usage: import { BLACK, WHITE, makeCanvas, frame, drawText } from "../../../scripts/icon-lib.mjs";
// A game icon is produced by public/games/<slug>/icon-draw.mjs exporting:
//   export function draw(size, maskable) { return makeCanvas(size) ...; return canvas; }
// The final canvas object exposes { rgba, set, rect, line } — the generator
// reads `canvas.rgba`.

import { deflateSync } from "node:zlib";

export const WHITE = 0xffffff;
export const BLACK = 0x000000;

// 5x7 uppercase font (columns are 5 wide, 7 rows). "." = empty, "#" = ink.
export const FONT = {
  A: ["###..","#...#","#...#","#####","#...#","#...#","#...#"],
  B: ["####.","#...#","####.","#...#","#...#","#...#","####."],
  C: [".###.","#...#","#....","#....","#....","#...#",".###."],
  D: ["####.","#...#","#...#","#...#","#...#","#...#","####."],
  E: ["#####","#....","####.","#....","#....","#....","#####"],
  F: ["#####","#....","####.","#....","#....","#....","#...."],
  G: [".###.","#...#","#....","#.###","#...#","#...#",".###."],
  H: ["#...#","#...#","#####","#...#","#...#","#...#","#...#"],
  I: ["#####","..#..","..#..","..#..","..#..","..#..","#####"],
  J: ["..###","...#.","...#.","...#.","...#.","#..#.",".##.."],
  K: ["#...#","#..#.","###..","#..#.","#..#.","#...#","#...#"],
  L: ["#....","#....","#....","#....","#....","#....","#####"],
  M: ["#...#","##.##","#.#.#","#.#.#","#...#","#...#","#...#"],
  N: ["#...#","##..#","#.#.#","#..##","#...#","#...#","#...#"],
  O: [".###.","#...#","#...#","#...#","#...#","#...#",".###."],
  P: ["####.","#...#","####.","#....","#....","#....","#...."],
  Q: [".###.","#...#","#...#","#...#","#.#.#","#..#.",".##.#"],
  R: ["####.","#...#","####.","#..#.","#.#..","#...#","#...#"],
  S: [".####","#....","#....",".###.","....#","....#","####."],
  T: ["#####","..#..","..#..","..#..","..#..","..#..","..#.."],
  U: ["#...#","#...#","#...#","#...#","#...#","#...#",".###."],
  V: ["#...#","#...#","#...#","#...#","#...#",".#.#.","..#.."],
  W: ["#...#","#...#","#...#","#.#.#","#.#.#","##.##","#...#"],
  X: ["#...#","#...#",".#.#.","..#..",".#.#.","#...#","#...#"],
  Y: ["#...#","#...#",".#.#.","..#..","..#..","..#..","..#.."],
  Z: ["#####","....#","...#.","..#..",".#...","#....","#####"],
  "0": [".###.","#...#","#..##","#.#.#","##..#","#...#",".###."],
  "1": ["..#..",".##..","..#..","..#..","..#..","..#..",".###."],
  "2": [".###.","#...#","....#","...#.","..#..",".#...","#####"],
  "3": [".###.","#...#","....#","..##.","....#","#...#",".###."],
  "4": ["...#.","..##.",".#.#.","#..#.","#####","...#.","...#."],
  "5": ["#####","#....","####.","....#","....#","#...#",".###."],
  "6": [".###.","#....","#....","####.","#...#","#...#",".###."],
  "7": ["#####","....#","...#.","..#..",".#...",".#...",".#..."],
  "8": [".###.","#...#","#...#",".###.","#...#","#...#",".###."],
  "9": [".###.","#...#","#...#",".####","....#","....#",".###."],
  "!": ["..#..","..#..","..#..","..#..","..#..",".....","..#.."],
  "?": [".###.","#...#","....#","...#.","..#..",".....","..#.."],
  "-": [".....",".....","#####",".....",".....",".....","....."],
  "*": [".....","#.#.#",".###.","#####",".###.","#.#.#","....."],
};

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

export function png(width, height, rgba) {
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

export function makeCanvas(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const set = (x, y, c) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    rgba[i] = (c >> 16) & 0xff; rgba[i + 1] = (c >> 8) & 0xff; rgba[i + 2] = c & 0xff; rgba[i + 3] = 255;
  };
  const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, c); };
  const line = (x0, y0, x1, y1, c, thickness = 1) => {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
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

// hard border frame inset by `m` px, thickness `frameW`
export function frame(canvas, size, m, frameW, color = BLACK) {
  canvas.rect(m, m, size - 2 * m, frameW, color);
  canvas.rect(m, size - m - frameW, size - 2 * m, frameW, color);
  canvas.rect(m, m, frameW, size - 2 * m, color);
  canvas.rect(size - m - frameW, m, frameW, size - 2 * m, color);
}

// draw text (letters/digits from FONT) horizontally centered at yTop
export function drawText(canvas, text, size, scale, yTop, color = BLACK) {
  const glyphW = 5 * scale;
  const gap = scale;
  const totalW = text.length * glyphW + (text.length - 1) * gap;
  let x0 = Math.round((size - totalW) / 2);
  for (const ch of text) {
    const rows = FONT[ch.toUpperCase()];
    if (!rows) { x0 += glyphW + gap; continue; }
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 5; c++)
        if (rows[r][c] === "#") canvas.rect(x0 + c * scale, yTop + r * scale, scale, scale, color);
    x0 += glyphW + gap;
  }
}
