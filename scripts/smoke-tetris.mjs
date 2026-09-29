// Tetris smoke: test the PURE game core exposed by game.js (globalThis.TetrisCore)
// in node:vm, plus the real game loop driven through an injected state hook
// (same pattern as smoke-golf.mjs — shipped file untouched).
// Proves: spawn shapes/bounds, rotation with SRS-lite wall kicks (success +
// failure), collision (floor/wall/stack), line clear 1–4 rows + collapse,
// scoring matrix x level, gravity ramp interval math, soft/hard drop,
// game-over on spawn collision, and best persistence ("tetris_best").
import { readFileSync } from "node:fs";
import vm from "node:vm";

const code = readFileSync(new URL("../public/games/tetris/game.js", import.meta.url), "utf8");

// Inject a state hook just before the boot lines.
const hooked = code.replace(
  "  resetGame();\n  requestAnimationFrame(frame);\n  registerSW();",
  "  __hooks({\n" +
  "    get: () => ({ board, cur, nextKind, score, lines, level, best, running, over, flash, soft: isSoft() }),\n" +
  "    start, move, rotate, gravityStep, hardDrop, spawnPiece,\n" +
  "    setBoard: (b) => { board = b; },\n" +
  "    setNext: (k) => { nextKind = k; },\n" +
  "  });\n" +
  "  resetGame();\n  requestAnimationFrame(frame);\n  registerSW();"
);
if (!hooked.includes("__hooks")) throw new Error("state hook injection failed");

const listeners = {};
const els = {};
const makeEl = (id) => ({
  id, textContent: "", innerHTML: "", hidden: false, disabled: false,
  style: { display: "" }, currentTarget: null,
  addEventListener: (ev, fn) => { (listeners[id + ":" + ev] ??= []).push(fn); },
  setAttribute: () => {},
  getContext: () => new Proxy({}, {
    get: (_t, prop) => (prop === "fillStyle" ? "black" : () => undefined),
    set: () => true,
  }),
});
for (const id of ["stage", "next", "score", "best", "level", "lines",
  "overlay", "overlayPanel", "overlayTitle", "overlaySub", "overlayScore",
  "overlayHint", "startBtn", "soundBtn", "btnLeft", "btnRight", "btnDown",
  "btnRot", "btnDrop"]) {
  els[id] = makeEl(id);
}

const rafQueue = [];
let rafTime = 0;

const sandbox = {
  console,
  window: {},
  document: {
    documentElement: { dataset: {} },
    getElementById: (id) => els[id] ?? makeEl(id),
    querySelector: () => null,
    addEventListener: (ev, fn) => { (listeners["doc:" + ev] ??= []).push(fn); },
  },
  localStorage: {
    store: {},
    getItem(k) { return this.store[k] ?? null; },
    setItem(k, v) { this.store[k] = String(v); },
  },
  matchMedia: () => ({ matches: false }),
  getComputedStyle: () => ({ getPropertyValue: () => "" }),
  location: { protocol: "https:" },
  navigator: { serviceWorker: { register: () => Promise.resolve() } },
  performance: { now: () => rafTime },
  requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
  setTimeout: (fn) => fn(), // make sfx chains synchronous
  clearInterval: () => {},
  clearTimeout: () => {},
  setInterval: () => 0,
};
sandbox.__hooks = (fn) => { sandbox.hooks = fn; };

vm.createContext(sandbox);
vm.runInContext(hooked, sandbox);

const core = sandbox.TetrisCore;
if (!core) throw new Error("TetrisCore not exposed — pure core marker missing");
const { COLS, ROWS, SHAPES, KINDS, emptyBoard, cellsAt, collides, rotateCW,
        KICKS, tryRotate, fullRows, collapseRows, levelFor, gravityMs,
        lineScore, SOFT_DIVISOR, FLASH_MS } = core;

const hooks = sandbox.hooks;
const st = () => hooks.get();
const bump = (ms) => {
  rafTime += ms;
  const fns = rafQueue.splice(0);
  for (const fn of fns) fn(rafTime);
};

let failed = 0;
const assert = (cond, msg) => {
  if (!cond) { console.error("FAIL:", msg); failed++; return; }
  console.log("PASS:", msg);
};

// ═══ 1. spawn shapes: 7 pieces, 4 cells each, all inside the board ════
{
  const empty = emptyBoard();
  assert(KINDS.length === 7 &&
         ["I", "O", "T", "S", "Z", "J", "L"].every((k) => SHAPES[k]) &&
         KINDS.every((k) => SHAPES[k].cells.length === 4),
    "7 tetrominoes defined, 4 cells each");
  assert(KINDS.every((k) => {
    const s = SHAPES[k];
    const abs = cellsAt(s.spawnX, 0, s.cells);
    return abs.every(([x, y]) => x >= 0 && x < COLS && y >= 0 && y < ROWS) &&
           !collides(empty, abs);
  }), "every piece spawns fully inside the empty 10x20 board");

  // rotation is a pure 90° CW inside the shape box
  const tRot = rotateCW(SHAPES.T, SHAPES.T.cells).slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  assert(JSON.stringify(tRot) === JSON.stringify([[1, 0], [1, 1], [1, 2], [2, 1]]),
    "T rotates CW to a vertical T in its 3x3 box");
  const iRot = rotateCW(SHAPES.I, SHAPES.I.cells);
  assert(JSON.stringify(iRot) === JSON.stringify([[2, 0], [2, 1], [2, 2], [2, 3]]),
    "I rotates CW to a vertical column");
}

// ═══ 2. wall kicks: offset success, and clean failure at the floor ════
{
  const empty = emptyBoard();
  // I horizontal at x=8: direct rotation would poke out the right wall →
  // SRS-lite kick moves it left one cell
  const kicked = tryRotate(SHAPES.I, SHAPES.I.cells, 8, 0, empty);
  assert(kicked && kicked.x === 7 &&
         JSON.stringify(kicked.cells.map((c) => [kicked.x + c[0], kicked.y + c[1]])) ===
         JSON.stringify([[9, 0], [9, 1], [9, 2], [9, 3]]),
    "I rotation near the right wall succeeds via a -1 kick");
  // vertical I on the bottom row: horizontal-only kicks cannot fix y overflow
  const fail = tryRotate(SHAPES.I, rotateCW(SHAPES.I, SHAPES.I.cells), 0, ROWS - 1, empty);
  assert(fail === null, "rotation fails (returns null) when no kick offset fits");
}

// ═══ 3. collision: floor, wall, stack ═════════════════════════════════
{
  const empty = emptyBoard();
  assert(collides(empty, cellsAt(3, ROWS - 1, SHAPES.J.cells)),
    "piece on the last row collides with the floor");
  assert(collides(empty, cellsAt(0, 0, SHAPES.T.cells.map(([x, y]) => [x - 1, y]))),
    "piece shifted past the left wall collides");
  const stack = emptyBoard();
  stack[1][4] = "Z";
  assert(collides(stack, cellsAt(3, 0, SHAPES.T.cells)),
    "piece collides with an occupied stack cell");
  assert(!collides(emptyBoard(), cellsAt(3, 0, SHAPES.T.cells)),
    "same piece fits on an empty board");
}

// ═══ 4. line clear: 1–4 rows, collapse keeps survivor order ═══════════
{
  // one full row with a survivor above it
  const one = emptyBoard();
  one[17][0] = "J";
  for (let x = 0; x < COLS; x++) one[19][x] = "I";
  assert(JSON.stringify(fullRows(one)) === JSON.stringify([19]),
    "fullRows detects exactly the one full row");
  const c1 = collapseRows(one, fullRows(one));
  assert(c1[18][0] === "J" && c1[19].every((c) => c === null) &&
         c1.slice(0, 18).every((r) => r.every((c) => c === null)),
    "1-row collapse: survivor sinks exactly one row, cleared row emptied");

  // four full rows at once
  const four = emptyBoard();
  for (const y of [16, 17, 18, 19]) for (let x = 0; x < COLS; x++) four[y][x] = "S";
  four[15][2] = "L";
  assert(JSON.stringify(fullRows(four)) === JSON.stringify([16, 17, 18, 19]),
    "fullRows detects a 4-row stack");
  const c4 = collapseRows(four, fullRows(four));
  assert(c4[19][2] === "L" &&
         c4.slice(0, 16).every((r) => r.every((c) => c === null)),
    "4-row collapse: partial row sinks below four emptied rows");

  // non-adjacent clears
  const two = emptyBoard();
  for (let x = 0; x < COLS; x++) { two[10][x] = "S"; two[19][x] = "Z"; }
  const c2 = collapseRows(two, fullRows(two));
  assert(c2[19][0] === null && c2.flat().every((c) => c === null),
    "clearing two non-adjacent rows empties the whole board");
}

// ═══ 5. scoring matrix x level + gravity ramp math ════════════════════
{
  assert([100, 300, 500, 800].every((pts, i) => lineScore(i + 1, 1) === pts),
    "line clear base points are 100/300/500/800 for 1/2/3/4 lines");
  assert([1, 2, 3, 4].every((n) => lineScore(n, 4) === [100, 300, 500, 800][n - 1] * 4),
    "line score multiplies by the current level");
  assert(levelFor(0) === 1 && levelFor(9) === 1 && levelFor(10) === 2 &&
         levelFor(19) === 2 && levelFor(20) === 3,
    "level = 1 + floor(lines/10)");
  assert(gravityMs(1) === 800 && gravityMs(2) === 740 && gravityMs(5) === 560,
    "gravity starts at 800ms and ramps -60ms per level");
}

// ═══ drive the real game through the injected hook ════════════════════
assert(st().best === 0, "best starts at 0 with an empty localStorage");

hooks.start();
assert(st().running && !st().over && st().board.every((r) => r.every((c) => c === null)) &&
       st().cur && st().cur.y === 0 && st().nextKind,
  "start begins a clean game with a spawned piece and a next-piece queued");

// ═══ 6. movement blocked by walls ═════════════════════════════════════
{
  const startX = st().cur.x;
  let guard = 0;
  while (hooks.move(-1) && guard++ < 20) { /* walk to the left wall */ }
  const atWall = st().cur.x;
  assert(atWall < startX && !hooks.move(-1) && st().cur.x === atWall,
    "piece walks to the left wall and further moves are rejected");
}

// ═══ 7. soft drop: +1 pt per descended cell ═══════════════════════════
{
  const before = { score: st().score, y: st().cur.y };
  hooks.gravityStep(true);
  assert(st().score === before.score + 1 && st().cur.y === before.y + 1,
    "soft-drop gravity step scores +1 and descends one cell");
  hooks.gravityStep(false);
  assert(st().score === before.score + 1,
    "normal gravity step scores nothing");
  assert(st().soft === false, "soft drop inactive without input");
}

// ═══ 8. hard drop: +2 pts per cell, piece locks into the stack ═════════
{
  hooks.setNext("O");
  hooks.spawnPiece();
  const cur = st().cur;
  assert(cur.kind === "O" && cur.x === 4 && cur.y === 0,
    "O spawns at its standard x=4 origin");
  hooks.hardDrop();
  const b = st().board;
  assert(b[18][4] === "O" && b[18][5] === "O" && b[19][4] === "O" && b[19][5] === "O",
    "hard drop slams the O into the bottom rows");
  assert(st().score === 1 + 18 * 2,
    "hard drop scores +2 per descended cell (18 cells from y=0)");
  assert(st().flash === null, "no flash when no row completed");
}

// ═══ 9. real 2-line clear through the game loop (flash → collapse) ════
{
  const gap = emptyBoard();
  for (const y of [18, 19]) {
    for (let x = 0; x < COLS; x++) if (x !== 4 && x !== 5) gap[y][x] = "Z";
  }
  hooks.setBoard(gap);
  hooks.setNext("O");
  hooks.spawnPiece();
  hooks.hardDrop();
  const before = { score: st().score, flashRows: st().flash?.rows };
  assert(before.flashRows && JSON.stringify(before.flashRows) === JSON.stringify([18, 19]),
    "completing two rows starts a 120ms flash of rows 18+19");

  bump(FLASH_MS + 60); // one frame past the flash window
  assert(st().flash === null && st().lines === 2 &&
         st().score === before.score + 300 * 1 &&
         st().board.every((r) => r.every((c) => c === null)),
    "flash elapses: 2 lines bank 300x1 pts and the board collapses empty");
}

// ═══ 10. gravity actually ticks through rAF at the level-1 interval ════
{
  const startY = st().cur.y;
  for (let i = 0; i < 20; i++) bump(50); // 1000ms of frames
  assert((st().cur && st().cur.y > startY) || st().board.some((r) => r.some(Boolean)),
    "gravity descends the piece across 800ms of accumulated frames");
}

// ═══ 11. game over on spawn collision + best persistence ══════════════
{
  const topout = emptyBoard();
  for (let x = 0; x < COLS; x++) topout[0][x] = "Z";
  hooks.setBoard(topout);
  hooks.setNext("T");
  hooks.spawnPiece();
  const s = st();
  assert(s.over && !s.running, "spawn colliding with a topped-out board ends the game");
  assert(sandbox.localStorage.store.tetris_best === String(s.score) && s.best === s.score,
    "game over persists the score to localStorage tetris_best");
  assert(els.overlayTitle.innerHTML.includes("GAME") &&
         els.overlayScore.innerHTML.includes("SCORE"),
    "game-over overlay shows the score panel");
}

// ═══ 12. restart keeps the persisted best ═════════════════════════════
{
  hooks.start();
  const s = st();
  assert(s.running && !s.over && s.score === 0 &&
         s.board.every((r) => r.every((c) => c === null)),
    "restart deals a fresh empty board and zero score");
  assert(s.best === Number(sandbox.localStorage.store.tetris_best) &&
         els.best.textContent === `BEST ${s.best}`,
    "best survives the restart from localStorage");
  assert(gravityMs(s.level) === 800 && SOFT_DIVISOR === 5 && FLASH_MS === 120,
    "fresh game resets to level-1 gravity; soft-drop is 5x; flash is 120ms");
}

if (failed > 0) process.exit(1);
console.log("\nALL TETRIS SMOKE CHECKS PASSED");
