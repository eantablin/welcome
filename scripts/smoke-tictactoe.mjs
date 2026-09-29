// Tic-tac-toe smoke: minimax AI must never lose.
// 1. Extract the pure game core from game.js.
// 2. AI (O) vs random X over 300 games → assert 0 AI losses.
// 3. Exhaustive check: for every reachable position where it's O's move,
//    O's chosen move never leads to a position where X can force a win.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const code = readFileSync(new URL("../public/tictactoe/game.js", import.meta.url), "utf8");
const core = code.match(/const LINES = [\s\S]*?const bestMove = \(board\) => \{[\s\S]*?\n  \};/)[0];
if (!core || !core.includes("bestMove")) throw new Error("game core extraction failed");

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(core + "\nglobalThis.core = { winner, moves, minimax, bestMove };", sandbox);
const { winner, moves, minimax, bestMove } = sandbox.core;

const assert = (cond, msg) => { if (!cond) { console.error("FAIL:", msg); process.exit(1); } console.log("PASS:", msg); };

// ── 1. AI never loses vs random X ──────────────────────────────────────
let losses = 0, wins = 0, draws = 0;
for (let game = 0; game < 300; game++) {
  const board = Array(9).fill("");
  for (;;) {
    // X plays uniformly random among open cells
    const open = moves(board);
    const x = open[Math.floor(Math.random() * open.length)];
    board[x] = "X";
    let w = winner(board);
    if (w) { losses++; break; }
    if (moves(board).length === 0) { draws++; break; }
    const o = bestMove(board);
    board[o] = "O";
    w = winner(board);
    if (w) { wins++; break; }
    if (moves(board).length === 0) { draws++; break; }
  }
}
assert(losses === 0, `300 random-strategy games: AI losses = 0 (W${wins} D${draws} L${losses})`);

// ── 2. Exhaustive: for every reachable position where O is to move,
// bestMove must achieve the position's optimal minimax value ──────────
const positions = Array(9).fill("");
let checked = 0, bad = 0;
const walk = (b, turn) => {
  if (winner(b) || moves(b).length === 0) return;
  if (turn === "O") {
    // optimal = best achievable score using bestMove's own convention
    const open = moves(b);
    let optimal = Infinity;
    for (const m of open) {
      b[m] = "O";
      optimal = Math.min(optimal, minimax([...b], "X", 1));
      b[m] = "";
    }
    const m = bestMove([...b]);
    b[m] = "O";
    const achieved = minimax([...b], "X", 1);
    checked++;
    if (achieved !== optimal) {
      bad++;
      if (bad <= 3) console.error("  MISMATCH board=" + JSON.stringify(b.slice()) + " optimal=" + optimal + " achieved=" + achieved);
    }
    if (!winner(b)) walk(b, "X");
    b[m] = "";
  } else {    for (const x of moves(b)) {
      b[x] = "X";
      walk(b, "O");
      b[x] = "";
    }
  }
};
walk(positions, "X");
assert(bad === 0 && checked > 0, `exhaustive: ${checked} O-decision positions, all played optimally`);
assert(minimax(positions, "X") === 0, "perfect play from empty board is a draw (X first)");

// ── 3. minimax sanity: O avoids immediate loss when threatened ────────
// X has [0]=X [1]=X — O must block cell 2
const threat = ["X", "X", "", "", "O", "", "", "", ""];
assert(bestMove(threat) === 2, "blocks an immediate X win at row top");

console.log("\nALL TIC-TAC-TOE SMOKE CHECKS PASSED");
