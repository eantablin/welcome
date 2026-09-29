// SOLITAIRE icon: three fanned card rectangles — DFS-style.
// CARD W/H sourced from generated CSS specs: card --sel outline is 2px.
import { makeCanvas, frame, drawText, WHITE, BLACK } from "../../../scripts/icon-lib.mjs";

export function draw(size, maskable) {
  const canvas = makeCanvas(size);
  const m = maskable ? Math.round(size * 0.1) : Math.round(size * 0.05);
  const frameW = Math.max(2, Math.round(size * 0.03));

  canvas.rect(0, 0, size, size, WHITE);
  frame(canvas, size, m, frameW);

  // three cards fanned like a hand: center card + left/right, tilted spread
  const cardW = Math.round(size * 0.30);
  const cardH = Math.round(cardW * 1.4);
  const cy = Math.round((size - cardH) / 2);
  const cx = Math.round((size - cardW) / 2);

  const outline = (x, y, w, h) => {
    canvas.line(x, y, x + w - 1, y, BLACK, 2);
    canvas.line(x, y + h - 1, x + w - 1, y + h - 1, BLACK, 2);
    canvas.line(x, y, x, y + h - 1, BLACK, 2);
    canvas.line(x + w - 1, y, x + w - 1, y + h - 1, BLACK, 2);
  };

  // left card — white with outline
  const lx = cx - Math.round(cardW * 0.62);
  const ly = cy + Math.round(cardH * 0.06);
  canvas.rect(lx, ly, cardW, cardH, WHITE);
  outline(lx, ly, cardW, cardH);

  // right card — white with outline
  const rx = cx + Math.round(cardW * 0.62);
  const ry = ly;
  canvas.rect(rx, ry, cardW, cardH, WHITE);
  outline(rx, ry, cardW, cardH);

  // center card — filled black, on top
  canvas.rect(cx, cy, cardW, cardH, BLACK);
  // white A in the middle of the black card
  const scale = Math.max(2, Math.round(size / 40));
  drawText(canvas, "A", size, scale, Math.round(cy + cardH / 2 - 3 * scale), WHITE);

  return canvas;
}
