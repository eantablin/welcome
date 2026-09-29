// Icon for BRUTAL WHACK — frame + 3x3 hole grid with one filled mole
// square (paper eyes) and a hard diagonal strike line through it.
// Consumed by scripts/make-game-icons.mjs dynamic discovery.
import { makeCanvas, frame, WHITE, BLACK } from "../../../scripts/icon-lib.mjs";

export function draw(size, maskable) {
  const canvas = makeCanvas(size);
  canvas.rect(0, 0, size, size, WHITE);

  const m = Math.round(size * (maskable ? 0.10 : 0.05));
  const frameW = Math.max(2, Math.round(size * 0.05));
  frame(canvas, size, m, frameW);

  // 3x3 grid of outlined holes, one filled mole cell in the center
  const pad = Math.round(size * 0.17);
  const span = size - 2 * pad;
  const gap = Math.round(span * 0.18);
  const cell = Math.floor((span - 2 * gap) / 3);
  const holeW = Math.max(2, Math.round(size * 0.02)); // hole outline weight
  const MOLE = 4; // center cell

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const x = pad + c * (cell + gap);
      const y = pad + r * (cell + gap);
      if (r * 3 + c === MOLE) {
        // mole: filled ink square with two paper eyes
        canvas.rect(x, y, cell, cell, BLACK);
        const eyeW = Math.max(2, Math.round(cell * 0.18));
        const eyeH = Math.max(2, Math.round(cell * 0.18));
        const eyeY = y + Math.round(cell * 0.26);
        canvas.rect(x + Math.round(cell * 0.20), eyeY, eyeW, eyeH, WHITE);
        canvas.rect(x + cell - Math.round(cell * 0.20) - eyeW, eyeY, eyeW, eyeH, WHITE);
        // strike line diagonally through the mole
        const inset = Math.round(cell * 0.08);
        canvas.line(
          x + inset, y + inset,
          x + cell - inset, y + cell - inset,
          WHITE, Math.max(2, Math.round(cell * 0.10))
        );
      } else {
        // empty hole: outlined square (soft look via thin ink outline)
        canvas.rect(x, y, cell, holeW, BLACK);                         // top
        canvas.rect(x, y + cell - holeW, cell, holeW, BLACK);          // bottom
        canvas.rect(x, y + holeW, holeW, cell - 2 * holeW, BLACK);     // left
        canvas.rect(x + cell - holeW, y + holeW, holeW, cell - 2 * holeW, BLACK); // right
      }
    }
  }
  return canvas;
}
