// BRUTAL GOLF icon: white paper, hard black border frame, golf flag on a
// pole with a small square ball beside it. Script shared by
// make-game-icons.mjs via dynamic import — exports draw(size, maskable)
// returning a canvas.
import { makeCanvas, frame, BLACK, WHITE } from "../../../scripts/icon-lib.mjs";

export function draw(size, maskable) {
  const canvas = makeCanvas(size);
  const m = maskable ? Math.round(size * 0.1) : Math.round(size * 0.05);
  const inner = size - m * 2;
  const frameW = Math.max(2, Math.round(inner * 0.05));
  canvas.rect(0, 0, size, size, WHITE);
  frame(canvas, size, m, frameW);

  // flagpole — vertical ink line on the left-center of the inner area
  const poleX = Math.round(m + inner * 0.32);
  const poleTop = Math.round(m + inner * 0.18);
  const poleBottom = Math.round(size - m - frameW - inner * 0.14);
  canvas.rect(poleX, poleTop, Math.max(2, Math.round(size * 0.02)), poleBottom - poleTop, BLACK);

  // flag — filled black rect attached to the pole's top, pointing right
  const flagW = Math.round(inner * 0.3);
  const flagH = Math.round(inner * 0.18);
  canvas.rect(poleX, poleTop, flagW, flagH, BLACK);

  // ground line — a short ink strip under the pole
  const groundY = poleBottom;
  canvas.rect(Math.round(m + inner * 0.1), groundY, Math.round(inner * 0.6), Math.max(2, Math.round(inner * 0.03)), BLACK);

  // ball — small filled square to the right of the pole on the ground
  const ballSize = Math.max(3, Math.round(inner * 0.1));
  const ballX = Math.round(m + inner * 0.72);
  const ballY = groundY - ballSize;
  canvas.rect(ballX, ballY, ballSize, ballSize, BLACK);

  return canvas;
}
