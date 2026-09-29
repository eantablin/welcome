// Icon drawing for BRUTAL WORDLE: white paper, hard border frame,
// a 5-cell guess row with letters W-O-R-D overlaid, monochrome ink only.
import { makeCanvas, frame, drawText, BLACK, WHITE } from "../../../scripts/icon-lib.mjs";

export function draw(size, maskable) {
  const canvas = makeCanvas(size);
  const m = Math.round(maskable ? size * 0.1 : size * 0.05);
  const frameW = Math.max(2, Math.round(size * 0.04));

  // white paper + hard border
  canvas.rect(0, 0, size, size, WHITE);
  frame(canvas, size, m, frameW, BLACK);

  // "W?RD" — the answer, one letter hidden
  const scale = Math.max(2, Math.floor(size / 14));
  const glyphH = 7 * scale;
  drawText(canvas, "W?RD", size, scale, Math.round((size - glyphH) / 2), BLACK);

  // hard answer bar beneath the glyph ("reveal the word" strip)
  const barH = Math.max(2, Math.round(size * 0.045));
  const barY = Math.round((size + glyphH) / 2) + barH;
  canvas.rect(m + frameW * 2, barY, size - 2 * (m + frameW * 2), barH, BLACK);

  return canvas;
}
