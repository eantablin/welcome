// RAYS raycaster icon — white paper, black ink, hard border frame.
// Perspective corridor: two converging diagonal lines meeting a hatched end wall.
import { makeCanvas, frame, BLACK, WHITE } from "../../../scripts/icon-lib.mjs";

export function draw(size, maskable) {
  const canvas = makeCanvas(size);
  const m = maskable ? Math.round(size * 0.1) : Math.round(size * 0.05);
  const inner = size - m * 2;
  const frameW = Math.max(2, Math.round(inner * 0.055));
  canvas.rect(0, 0, size, size, WHITE);
  frame(canvas, size, m, frameW);

  // hatched end wall (back of corridor), centered above the bottom frame
  const wallW = Math.round(inner * 0.34);
  const wallH = Math.round(inner * 0.34);
  const wx = Math.round((size - wallW) / 2);
  const wy = Math.round(size - m - frameW - wallH);
  const gap = Math.max(2, Math.round(size * 0.02));
  for (let yy = 0; yy < wallH; yy++) {
    if ((yy % (gap * 2)) < gap) {
      canvas.rect(wx, wy + yy, wallW, 1, BLACK);
    }
  }

  // two converging diagonals from the bottom frame corners to the end-wall bottom corners
  const lw = Math.max(2, Math.round(size * 0.07));
  canvas.line(m + frameW, size - m - frameW, wx, wy + wallH, BLACK, lw);
  canvas.line(size - m - frameW, size - m - frameW, wx + wallW, wy + wallH, BLACK, lw);
  return canvas;
}
