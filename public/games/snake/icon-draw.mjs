// SNAKE icon — zigzag snake body line, square head, separate food square.
// White paper + hard border frame + monochrome glyph. Pure canvas ops,
// no file I/O (the icon generator reads canvas.rgba).
import { makeCanvas, frame, BLACK, WHITE } from "../../../scripts/icon-lib.mjs";

export function draw(size, maskable) {
  const canvas = makeCanvas(size);
  const m = maskable ? Math.round(size * 0.1) : Math.round(size * 0.05);
  const inner = size - m * 2;
  const frameW = Math.max(2, Math.round(inner * 0.055));

  canvas.rect(0, 0, size, size, WHITE);
  frame(canvas, size, m, frameW);

  const lw = Math.max(3, Math.round(size * 0.05)); // snake stroke width

  // zigzag body: three horizontal runs joined by two verticals
  const y1 = Math.round(size * 0.34);
  const y2 = Math.round(size * 0.52);
  const y3 = Math.round(size * 0.72);
  const xL = Math.round(size * 0.26);
  const xR = Math.round(size * 0.6);
  const xHead = Math.round(size * 0.76);

  canvas.line(xL, y1, xR, y1, BLACK, lw);
  canvas.line(xR, y1, xR, y2, BLACK, lw);
  canvas.line(xR, y2, xL, y2, BLACK, lw);
  canvas.line(xL, y2, xL, y3, BLACK, lw);
  canvas.line(xL, y3, xHead, y3, BLACK, lw);

  // square head at the end of the body line
  const headS = Math.max(4, Math.round(size * 0.12));
  const hx = xHead - Math.floor(headS / 2);
  const hy = y3 - Math.floor(headS / 2);
  canvas.rect(hx, hy, headS, headS, BLACK);

  // separate food square (hollow outline), upper right
  const foodS = Math.max(4, Math.round(size * 0.13));
  const fx = Math.round(size * 0.68);
  const fy = Math.round(size * 0.15);
  canvas.rect(fx, fy, foodS, lw, BLACK);
  canvas.rect(fx, fy + foodS - lw, foodS, lw, BLACK);
  canvas.rect(fx, fy, lw, foodS, BLACK);
  canvas.rect(fx + foodS - lw, fy, lw, foodS, BLACK);

  return canvas;
}
