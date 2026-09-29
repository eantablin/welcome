// TETRIS icon — purple T piece overlapping a cyan I piece on white paper.
// Flat signal-style blocks with hard ink borders (this icon MAY use color).
// Pure canvas ops, integer coordinates, no file I/O (the generator reads
// canvas.rgba).
import { makeCanvas, frame, BLACK, WHITE } from "../../../scripts/icon-lib.mjs";

const PURPLE = 0x9b5de5;
const CYAN = 0x2ec5c5;

export function draw(size, maskable) {
  const canvas = makeCanvas(size);
  const m = maskable ? Math.round(size * 0.1) : Math.round(size * 0.05);
  const inner = size - m * 2;
  const frameW = Math.max(2, Math.round(inner * 0.055));

  canvas.rect(0, 0, size, size, WHITE);
  frame(canvas, size, m, frameW);

  const cell = Math.max(8, Math.round(size * 0.12));
  const b = Math.max(2, Math.round(cell * 0.14)); // ink border thickness

  const block = (x, y, color) => {
    canvas.rect(x, y, cell, cell, color);
    canvas.rect(x, y, cell, b, BLACK);
    canvas.rect(x, y + cell - b, cell, b, BLACK);
    canvas.rect(x, y, b, cell, BLACK);
    canvas.rect(x + cell - b, y, b, cell, BLACK);
  };

  // I piece (cyan) — four blocks in a row, lower right
  const ix = Math.round(size * 0.4);
  const iy = Math.round(size * 0.5);
  for (let i = 0; i < 4; i++) block(ix + i * cell, iy, CYAN);

  // T piece (purple) — stem over a three-block row, upper left,
  // overlapping the I row on top of it
  const tx = Math.round(size * 0.16);
  const ty = Math.round(size * 0.3);
  block(tx + cell, ty, PURPLE);
  block(tx, ty + cell, PURPLE);
  block(tx + cell, ty + cell, PURPLE);
  block(tx + 2 * cell, ty + cell, PURPLE);

  return canvas;
}
