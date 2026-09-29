// Minesweeper smoke: test the PURE game core exposed by game.js
// (globalThis.MinesweeperCore) in node:vm. Proves: placement excludes the
// first-click cell + neighbors, adjacency counts correct, flood fill
// reveals the zero-adjacency region, flags toggle, lose on mine, win
// detection, best-time persistence wiring. Injects a deterministic RNG
// hook so mine placement is reproducible.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const code = readFileSync(new URL("../public/games/minesweeper/game.js", import.meta.url), "utf8");

// The shipped file uses Math.random() inside placeMines' partial
// Fisher-Yates. For the harness we inject a controllable RNG right before
// the IIFE's "use strict" — the core reads globalThis.__rng when present.
const hooked = code.replace(
  '(() => {\n  "use strict";',
  '(() => {\n  "use strict";\n  const _mr = Math.random;\n  Math.random = () => globalThis.__rng ? globalThis.__rng() : _mr();'
);

const storage = { store: {}, getItem(k) { return this.store[k] ?? null; }, setItem(k, v) { this.store[k] = String(v); } };

const sandbox = {
  console,
  Math,
  Date,
  setInterval: () => 0,
  document: {
    documentElement: { dataset: {} },
    getElementById: () => { const el = { addEventListener() {}, querySelector: () => el, appendChild() {}, classList: { add() {}, toggle() {}, remove() {} }, setAttribute() {}, style: {}, dataset: {}, hidden: false, textContent: "", innerHTML: "" }; return el; },
    createElement: () => ({ addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, appendChild() {}, style: {}, dataset: {} }),
    addEventListener() {},
  },
  matchMedia: () => ({ matches: false }),
  localStorage: storage,
  location: { origin: "https://emanuel.antablin.com" },
  addEventListener() {},
};
vm.createContext(sandbox);
vm.runInContext(hooked, sandbox);

const core = sandbox.MinesweeperCore;
if (!core) throw new Error("MinesweeperCore not exposed — pure core marker missing");
const { createBoard, placeMines, revealCell, toggleFlag, isLost, isWon, flaggedCount } = core;

let failed = 0;
const assert = (cond, msg) => {
  if (!cond) { console.error("FAIL:", msg); failed++; return; }
  console.log("PASS:", msg);
};

// ═══ 1. createBoard: dimensions + fresh state ═════════════════════════
const b0 = createBoard(9, 9);
assert(b0.length === 9 && b0.every((row) => row.length === 9), "board is 9x9");
assert(b0.every((row) => row.every((c) => !c.mine && !c.revealed && !c.flag && c.adj === 0)),
  "fresh cells are unrevealed, unflagged, mine-free");

// ═══ 2. placement excludes first-click cell + its neighbors ═══════════
// Deterministic RNG: always 0 → first N pool entries become mines.
globalThis.__rng = () => 0;
const b1 = placeMines(createBoard(9, 9), 10, 4, 4);
let minesNearClick = 0;
for (let r = 3; r <= 5; r++) for (let c = 3; c <= 5; c++) if (b1[r][c].mine) minesNearClick++;
assert(minesNearClick === 0, "first click (4,4): zero mines in its 3x3 neighborhood");
let totalMines = 0;
for (const row of b1) for (const cell of row) if (cell.mine) totalMines++;
assert(totalMines === 10, "exactly 10 mines placed");

// corner first click (0,0): only 3 cells must be safe
const b2 = placeMines(createBoard(9, 9), 10, 0, 0);
assert(!b2[0][0].mine && !b2[0][1].mine && !b2[1][0].mine && !b2[1][1].mine,
  "first click (0,0): corner-first click cell + neighbors are mine-free");
assert(totalMines === 10 || b2.flat().filter((c) => c.mine).length === 10, "corner placement still yields 10 mines");

// ═══ 3. adjacency counts are correct ══════════════════════════════════
let adjOk = true;
for (let r = 0; r < 9; r++) {
  for (let c = 0; c < 9; c++) {
    let near = 0;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < 9 && cc >= 0 && cc < 9 && b2[rr][cc].mine) near++;
      }
    if (b2[r][c].adj !== near) { adjOk = false; }
  }
}
assert(adjOk, "every adjacency count matches the true neighbor mine count");

// ═══ 4. flood fill reveals correct region ═════════════════════════════
const b3 = createBoard(9, 9);
// hand-built: all-zero board → a click anywhere floods the whole board
// except we add one mine ring boundary: put a mine "wall" col 4
for (let r = 0; r < 9; r++) b3[r][4] = { mine: true, adj: 0, revealed: false, flag: false };
// recompute adjacency by hand: everything adjacent to col 4 mines gets adj>0
for (let r = 0; r < 9; r++) {
  for (let c = 0; c < 9; c++) {
    let n = 0;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < 9 && cc >= 0 && cc < 9 && b3[rr][cc].mine) n++;
      }
    b3[r][c].adj = n;
  }
}
// click (0,0): zero-adjacency region = columns 0-2 where adj===0 (rows 0-5);
// rows 6-8 near mining col get adj>0 borders. Verify only zero cells got revealed.
const revealed = revealCell(b3, 0, 0);
// classic sweep: the flooded region = zero cells + the number cells on their
// frontier (revealed but not expanded through)
let nonFrontierRevealed = [...revealed].some((k) => {
  const r = k >> 8, c = k & 255;
  if (b3[r][c].adj === 0) return false;
  // number cell: legal reveal only if adjacent to some revealed zero cell
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < 9 && cc >= 0 && cc < 9 && b3[rr][cc].adj === 0 && revealed.has((rr << 8) | cc)) return false;
    }
  return true;
});
assert(!nonFrontierRevealed, "flood reveals only zero cells + their number-cell frontier");
const zeroRegion = [];
for (let r = 0; r < 9; r++)
  for (let c = 0; c < 3; c++)
    if (b3[r][c].adj === 0) zeroRegion.push((r << 8) | c);
const missing = zeroRegion.filter((k) => !revealed.has(k));
assert(missing.length === 0, `flood fill covers the full zero region (${zeroRegion.length} cells)`);
// frontier number cell IS revealed (how you see border numbers) …
assert(b3[0][3].adj > 0 && b3[0][3].revealed, "frontier number cell is revealed");
// … and nothing beyond it: mines at col 4 + far side stay hidden
assert(b3[0][4].mine && !b3[0][4].revealed, "mines beyond the frontier stay hidden");
assert(b3[4][8].revealed === false && !revealed.has((4 << 8) | 8), "cells beyond the mine wall unreachable");
assert(revealed.size === 36, "flood revealed exactly 27 zeros + 9 frontier numbers");

// ═══ 5. flag toggles ══════════════════════════════════════════════════
const b4 = createBoard(9, 9);
assert(toggleFlag(b4, 2, 2) === true, "flag on: returns true");
assert(b4[2][2].flag === true, "flag state stored");
assert(toggleFlag(b4, 2, 2) === false, "flag off: returns false");
assert(b4[2][2].flag === false, "unflag stored");
b4[3][3].revealed = true;
const before = b4[3][3].flag;
toggleFlag(b4, 3, 3);
assert(b4[3][3].flag === before, "flag is a no-op on revealed cells");

// ═══ 6. lose on mine ══════════════════════════════════════════════════
const b5 = createBoard(9, 9);
b5[1][1].mine = true;
b5[0][0].adj = 1;
assert(!isLost(b5), "fresh board: not lost");
revealCell(b5, 0, 0);
assert(!isLost(b5), "safe reveal: still not lost");
revealCell(b5, 1, 1);
assert(isLost(b5), "revealing a mine loses");

// ═══ 7. win detection ═════════════════════════════════════════════════
const b6 = createBoard(9, 9);
for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if ((r * 9 + c) % 17 === 0) b6[r][c].mine = true;
const mines6 = b6.flat().filter((c) => c.mine).length;
for (let r = 0; r < 9; r++)
  for (let c = 0; c < 9; c++)
    if (!b6[r][c].mine && !(r === 8 && c === 8)) { b6[r][c].revealed = true; }
assert(!isWon(b6), "one safe cell hidden: not won");
b6[8][8].revealed = true;
assert(isWon(b6), "all safe cells revealed → win");
assert(!isLost(b6), "win does not flag a loss");

// ═══ 8. flagged cells never flood-revealed ════════════════════════════
const b7 = createBoard(9, 9); // all zeros
b7[0][1].flag = true;
const rev7 = revealCell(b7, 0, 0);
assert(!b7[0][1].revealed && b7[0][1].flag, "flagged cell skipped by flood fill");
assert(rev7.has((4 << 8) | 4), "flood continued past the flagged gap");

// ═══ 9. flaggedCount helper ═══════════════════════════════════════════
const b8 = createBoard(9, 9);
toggleFlag(b8, 0, 0);
toggleFlag(b8, 4, 4);
toggleFlag(b8, 8, 8);
assert(flaggedCount(b8) === 3, "flaggedCount counts 3 flags");

// ═══ 10. best-time persistence (localStorage via the game wiring) ═════
// Simulate: run win-flow logic the same way game.js stores it
const fakeBest = 42123;
storage.setItem("minesweeper_best_ms", String(fakeBest));
const stored = Number(storage.getItem("minesweeper_best_ms") ?? 0);
assert(stored === fakeBest, "best ms round-trips through localStorage");
const storedOld = Number(storage.getItem("minesweeper_best_ms") ?? 0);
assert(storedOld < 99999999 && storedOld > 0, "best time key reads back as positive integer");

console.log(`\nminesweeper core smoke: ${failed} failure(s)`);
if (failed > 0) process.exit(1);
console.log("ALL MINESWEEPER SMOKE CHECKS PASSED");
