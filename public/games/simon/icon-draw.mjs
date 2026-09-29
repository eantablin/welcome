// Icon drawing for SIMON: white paper, hard frame, 2x2 pad quadrants,
// one quadrant filled solid. Pure Node canvas ops from icon-lib.
import { makeCanvas, frame, WHITE, BLACK } from "../../../scripts/icon-lib.mjs";

export function draw(size, maskable) {
  const canvas = makeCanvas(size);
  const m = maskable ? Math.round(size * 0.10) : Math.round(size * 0.05);
  const inner = size - m * 2;
  const frameW = Math.max(2, Math.round(inner * 0.055));
  canvas.rect(0, 0, size, size, WHITE);
  frame(canvas, size, m, frameW);

  // 2x2 quadrant grid inside the frame; quadrant III (bottom-left) filled
  const gridM = m + Math.round(frameW * 2.2);
  const grid = size - gridM * 2;
  const gap = Math.max(2, Math.round(size * 0.02));
  const cell = Math.floor((grid - gap) / 2);
  for (let q = 0; q < 4; q++) {
    const qx = gridM + (q % 2) * (cell + gap);
    const qy = gridM + Math.floor(q / 2) * (cell + gap);
    const filled = q === 2; // III
    canvas.rect(qx, qy, cell, cell, filled ? BLACK : WHITE);
    if (!filled) {
      const b = Math.max(2, Math.round(frameW * 0.6));
      canvas.rect(qx, qy, cell, b, BLACK);
      canvas.rect(qx, qy + cell - b, cell, b, BLACK);
      canvas.rect(qx, qy, b, cell, BLACK);
      canvas.rect(qx + cell - b, qy, b, cell, BLACK);
    }
  }
  return canvas;
}
