// Generates PWA icons for all games (white paper, black ink).
// Legacy games draw inline below; new-style games are discovered dynamically
// via public/games/*/icon-draw.mjs. PNG encoding comes from scripts/icon-lib.mjs.
// Pure Node + zlib — no image deps. Run: node scripts/make-game-icons.mjs
import { writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { png, makeCanvas, frame, drawText, WHITE, BLACK } from "./icon-lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

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

  // "21" digits, upper area (drawText centered the way drawGlyphs did)
  const scale = Math.max(3, Math.round(size * 0.06));
  const glyphH = 7 * scale;
  const topPad = Math.round(size * 0.11);
  // draw digits into a scratch canvas, then copy only the top band
  const digits = makeCanvas(size);
  drawText(digits, "21", size, scale, Math.round((size - glyphH) / 2), BLACK);
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
const SIZES = [
  ["icon-180.png", 180, false],
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-maskable-192.png", 192, true],
  ["icon-maskable-512.png", 512, true],
];

function emitIcons(relDir, draw) {
  const out = join(root, relDir, "icons");
  mkdirSync(out, { recursive: true });
  for (const [name, size, maskable] of SIZES) {
    const canvas = draw(size, maskable);
    writeFileSync(join(out, name), png(size, size, canvas.rgba));
  }
  console.log("icons \u2192", relDir);
}

const LEGACY_GAMES = [
  { dir: "public/games/brutal-bird", draw: drawBird },
  { dir: "public/blackjack", draw: drawBlackjack },
  { dir: "public/tictactoe", draw: drawTicTacToe },
];

for (const { dir, draw } of LEGACY_GAMES) emitIcons(dir, draw);

// ── dynamic discovery: public/games/<slug>/icon-draw.mjs ──────────────
const gamesDir = join(root, "public", "games");
const legacySlugs = new Set(LEGACY_GAMES.map(({ dir }) => dir.split("/").pop()));

let entries;
try {
  entries = readdirSync(gamesDir, { withFileTypes: true });
} catch (err) {
  console.log(`SKIP public/games: cannot scan (${err?.message ?? err})`);
}

if (entries) {
  for (const entry of entries) {
    if (!entry.isDirectory() || legacySlugs.has(entry.name)) continue;
    const slug = entry.name;
    const drawModule = join(gamesDir, slug, "icon-draw.mjs");
    try {
      if (!existsSync(drawModule)) {
        console.log(`SKIP ${slug}: no icon-draw.mjs yet`);
        continue;
      }
      const mod = await import(pathToFileURL(drawModule).href);
      if (typeof mod.draw !== "function") {
        throw new Error("icon-draw.mjs must export draw(size, maskable)");
      }
      emitIcons(`public/games/${slug}`, (size, maskable) => mod.draw(size, maskable));
    } catch (err) {
      console.log(`SKIP ${slug}: ${err?.message ?? err}`);
    }
  }
}
