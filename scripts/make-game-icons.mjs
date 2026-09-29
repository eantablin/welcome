// Generates BRUTAL BIRD PWA icons (white paper, black ink square bird).
// Pure Node + zlib — no image deps. Run: node make-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "icons");

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
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Icon: white bg, black frame, black bird square, white eye + beak notch.
// maskable: content shrunk into the inner 80% safe zone.
function drawIcon(size, maskable = false) {
  const rgba = Buffer.alloc(size * size * 4);
  const set = (x, y, c, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    rgba[i] = (c >> 16) & 0xff; rgba[i + 1] = (c >> 8) & 0xff; rgba[i + 2] = c & 0xff; rgba[i + 3] = a;
  };
  const WHITE = 0xffffff, BLACK = 0x000000;

  // content box: maskable keeps 10% margin all around (80% safe zone)
  const m = maskable ? Math.round(size * 0.1) : Math.round(size * 0.04);
  const inner = size - m * 2;
  const frame = Math.max(2, Math.round(inner * 0.055));

  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) set(x, y, WHITE);

  // frame
  for (let y = m; y < size - m; y++)
    for (let x = m; x < size - m; x++)
      if (x < m + frame || x >= size - m - frame || y < m + frame || y >= size - m - frame) set(x, y, BLACK);

  // bird square centered
  const birdSize = Math.round(inner * 0.42);
  const bx = Math.round((size - birdSize) / 2);
  const by = Math.round((size - birdSize) / 2);
  for (let y = by; y < by + birdSize; y++)
    for (let x = bx; x < bx + birdSize; x++) set(x, y, BLACK);

  // eye (white square, upper-right of bird)
  const eye = Math.max(3, Math.round(birdSize * 0.16));
  const ex = bx + Math.round(birdSize * 0.55), ey = by + Math.round(birdSize * 0.2);
  for (let y = ey; y < ey + eye; y++)
    for (let x = ex; x < ex + eye; x++) set(x, y, WHITE);

  // beak notch (white strip poking out right edge)
  const notchH = Math.max(3, Math.round(birdSize * 0.12));
  const ny = by + Math.round(birdSize * 0.45);
  for (let y = ny; y < ny + notchH; y++)
    for (let x = bx + birdSize; x < bx + birdSize + Math.round(birdSize * 0.12); x++) set(x, y, BLACK);

  return png(size, size, rgba);
}

for (const [name, size, maskable] of [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-maskable-192.png", 192, true],
  ["icon-maskable-512.png", 512, true],
]) {
  writeFileSync(join(outDir, name), drawIcon(size, maskable));
  console.log("wrote", name);
}
