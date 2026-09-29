// 2048 icon: frame + 2x2 block motif with "2048" digits on top.
// White paper, black ink, hard borders. Script shared by make-game-icons.mjs
// via dynamic import — exports draw(size, maskable) returning a canvas.
import { makeCanvas, frame, drawText, BLACK, WHITE } from "../../../scripts/icon-lib.mjs";

export function draw(size, maskable) {
  const canvas = makeCanvas(size);
  const m = maskable ? Math.round(size * 0.1) : Math.round(size * 0.05);
  const inner = size - m * 2;
  const frameW = Math.max(2, Math.round(inner * 0.05));
  canvas.rect(0, 0, size, size, WHITE);
  frame(canvas, size, m, frameW);

  // 2x2 block motif — smaller tiles sit at the grid area, unequal sizes
  // to hint at the merge progression (small / small / big / bigger)
  const gridStart = m + frameW + Math.round(inner * 0.04);
  const gridEnd = size - gridStart;
  const grid = gridEnd - gridStart;
  const cell = Math.round(grid / 2);
  const gapPx = Math.max(2, Math.round(inner * 0.03));
  const half = Math.round((cell - gapPx) / 2);
  const small = half - Math.round(inner * 0.06);
  const big = half + Math.round(inner * 0.06);

  const cx = gridStart + Math.round(grid / 2);
  const cy = gridStart + Math.round(grid / 2);
  const top = gridStart;
  const left0 = gridStart;
  const left1 = cx;

  // top-left: small tile
  canvas.rect(left0, top, small, small, BLACK);
  // top-right: slightly smaller tile (nestle against center)
  canvas.rect(left1 + gapPx, top, small, small, BLACK);
  // bottom-left: big tile
  canvas.rect(left0, cy + gapPx, big, big, BLACK);
  // bottom-right: biggest tile (the soon-to-merge one) with paper pip
  const lastW = big + Math.round(inner * 0.06);
  canvas.rect(left1 + gapPx, cy + gapPx, lastW, lastW, BLACK);
  const pipGap = Math.max(2, Math.round(lastW * 0.15));
  canvas.rect(left1 + gapPx + lastW - pipGap - Math.max(3, Math.round(lastW * 0.18)), cy + gapPx + pipGap, Math.max(3, Math.round(lastW * 0.18)), Math.max(3, Math.round(lastW * 0.18)), WHITE);

  // "2048" digits as a strip across the middle — over the block motif
  const scale = Math.max(3, Math.round(size * 0.055));
  const glyphH = 7 * scale;
  const yTop = Math.round((size - glyphH) / 2);
  // white band behind digits so they stay readable over the black blocks
  canvas.rect(m + frameW, yTop - scale, size - 2 * (m + frameW), glyphH + 2 * scale, WHITE);
  drawText(canvas, "2048", size, scale, yTop, BLACK);
  return canvas;
}
