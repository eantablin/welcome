// Minesweeper icon: white paper, hard border frame, black mine
// (filled square with 8 spike lines radiating out).
import { makeCanvas, frame, BLACK, WHITE } from "../../../scripts/icon-lib.mjs";

export function draw(size, maskable) {
  const canvas = makeCanvas(size);
  const m = maskable ? Math.round(size * 0.1) : Math.round(size * 0.05);
  const inner = size - m * 2;
  const frameW = Math.max(2, Math.round(inner * 0.055));
  canvas.rect(0, 0, size, size, WHITE);
  frame(canvas, size, m, frameW);

  const cx = Math.round(size / 2);
  const cy = Math.round(size / 2);
  const body = Math.max(6, Math.round(inner * 0.3)); // square body side
  const half = Math.round(body / 2);
  const off = Math.max(3, Math.round(inner * 0.02)); // gap between body and spike start

  // 8 spikes: 4 cardinal (long) + 4 diagonal (shorter), drawn first so the
  // body paints over their inner ends
  const long = Math.round(inner * 0.22);
  const short = Math.round(long * 0.72);
  const spokes = [
    [0, -1], [0, 1], [-1, 0], [1, 0],
    [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7],
  ];
  const sw = Math.max(2, Math.round(size * 0.035));
  for (const [dx, dy] of spokes) {
    const diag = dx !== 0 && dy !== 0;
    const len = diag ? short : long;
    const ex = Math.round(cx + dx * (half + off + len));
    const ey = Math.round(cy + dy * (half + off + len));
    canvas.line(cx, cy, ex, ey, BLACK, sw);
  }

  // body: filled square centered
  canvas.rect(cx - half, cy - half, body, body, BLACK);

  // gloss notch: small white square in the top-left of the body
  const gloss = Math.max(2, Math.round(body * 0.22));
  canvas.rect(cx - half + gloss, cy - half + gloss, gloss, gloss, WHITE);

  return canvas;
}
