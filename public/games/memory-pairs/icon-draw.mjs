// MEMORY PAIRS icon: two overlapping card rectangles — one filled, one outlined.
// Runs via scripts/make-game-icons.mjs (which imports this draw()).
import { makeCanvas, frame, WHITE, BLACK } from "../../../scripts/icon-lib.mjs";

export function draw(size, maskable) {
  const canvas = makeCanvas(size);
  const m = maskable ? Math.round(size * 0.1) : Math.round(size * 0.05);
  const frameW = Math.max(2, Math.round(size * 0.03));

  canvas.rect(0, 0, size, size, WHITE);
  frame(canvas, size, m, frameW);

  const cardW = Math.round(size * 0.34);
  const cardH = Math.round(cardW * 1.4);
  const oy = Math.round((size - cardH) / 2);

  // back card — filled black, lower-left
  const bx = Math.round((size - cardW) / 2 - size * 0.11);
  const by = oy + Math.round(size * 0.11);
  canvas.rect(bx, by, cardW, cardH, BLACK);

  // front card — white with hard outline, upper-right
  const fx = Math.round((size - cardW) / 2 + size * 0.11);
  const fy = oy - Math.round(size * 0.11);
  canvas.rect(fx, fy, cardW, cardH, WHITE);
  const ow = Math.max(2, Math.round(size * 0.028));
  // top
  canvas.line(fx, fy, fx + cardW, fy, BLACK, ow);
  // bottom
  canvas.line(fx, fy + cardH, fx + cardW, fy + cardH, BLACK, ow);
  // left
  canvas.line(fx, fy, fx, fy + cardH, BLACK, ow);
  // right
  canvas.line(fx + cardW, fy, fx + cardW, fy + cardH, BLACK, ow);

  return canvas;
}
