// 2048 smoke: run the pure game core from public/games/2048/game.js against node.
// Extracts moveRowLeft / moveBoard / empties / spawn / gameOver by regex
// (shipped file is untouched) and drives them with a seeded RNG.
// Proves: slide, single-merge-per-pair, merge priority left-to-right,
// no-move detection, win tile, spawn 90/10, score accumulation.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const code = readFileSync(new URL("../public/games/2048/game.js", import.meta.url), "utf8");
const core = code.match(/const SIZE = 4;[\s\S]*?const gameOver = \(board\) => \{[\s\S]*?\n  \};/)[0];
if (!core || !core.includes("gameOver")) throw new Error("game core extraction failed");

const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(core + "\nglobalThis.core = { moveRowLeft, moveBoard, empties, spawn, gameOver };", sandbox);
const { moveRowLeft, moveBoard, empties, spawn, gameOver } = sandbox.core;

const assert = (cond, msg) => { if (!cond) { console.error("FAIL:", msg); process.exit(1); } console.log("PASS:", msg); };
const fmt = (b) => b.map((r) => r.map((v) => String(v).padStart(4, " ")).join("")).join(" / ");

// ── 1. slide: tiles compact left, zeros move right ────────────────────
{
  const { row, gained } = moveRowLeft([0, 2, 0, 4]);
  assert(JSON.stringify(row) === "[2,4,0,0]" && gained === 0, `slide compacts left ([0,2,0,4]→[2,4,0,0]), got [${row}]`);
}

// ── 2. single merge per pair: [2,2,2,2] must become [4,4,0,0] not [8,…] ─
{
  const r1 = moveRowLeft([2, 2, 2, 2]);
  assert(JSON.stringify(r1.row) === "[4,4,0,0]" && r1.gained === 8, `single merge per pair [2,2,2,2]→[4,4,0,0] gained 8, got [${r1.row}] gained ${r1.gained}`);
}

// ── 3. merge priority left-to-right: [4,4,8] → [8,8,0] not [4,16] ──────
{
  const r = moveRowLeft([4, 4, 8, 0]);
  assert(JSON.stringify(r.row) === "[8,8,0,0]" && r.gained === 8, `leftmost pair merges first [4,4,8,0]→[8,8,0,0], got [${r.row}]`);
}

// ── 3b. fresh pair doesn't chain ───────────────────────────────────────
{
  const r = moveRowLeft([2, 2, 4, 0]);
  assert(JSON.stringify(r.row) === "[4,4,0,0]", `post-merge does not re-merge [2,2,4,0]→[4,4,0,0], got [${r.row}]`);
}

// ── 4. all four directions on a full column ───────────────────────────
{
  // vertical line 2,2,2,2 in col 0 — "up" merges to top (4,4 at rows 0..1)
  const b = [[2,0,0,0],[2,0,0,0],[2,0,0,0],[2,0,0,0]];
  const up = moveBoard(b, "up");
  assert(up.moved && up.gained === 8 && up.board[0][0] === 4 && up.board[1][0] === 4 && up.board[2][0] === 0, `move up merges column (gained 8), got ${fmt(up.board)}`);
  const down = moveBoard(b, "down");
  assert(down.moved && down.gained === 8 && down.board[3][0] === 4 && down.board[2][0] === 4 && down.board[0][0] === 0, `move down merges column, got ${fmt(down.board)}`);
  const rowBoard = [[2, 2, 2, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  const left = moveBoard(rowBoard, "left");
  assert(left.moved && left.gained === 8 && left.board[0][0] === 4 && left.board[0][1] === 4, `move left merges row (gained 8), got ${fmt(left.board)}`);
  const right = moveBoard(rowBoard, "right");
  assert(right.moved && right.gained === 8 && right.board[0][3] === 4 && right.board[0][2] === 4, `move right merges row, got ${fmt(right.board)}`);
}

// ── 5. no-move detection: full frozen board reports moved=false ────────
{
  const frozen = [
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 4, 2],
  ];
  for (const dir of ["left", "right", "up", "down"]) {
    const r = moveBoard(frozen, dir);
    assert(!r.moved && r.gained === 0, `no-move detected for ${dir} on alternating board`);
  }
}

// ── 6. win tile detection: merging into 2048 sets hit2048 ─────────────
{
  const win = moveBoard([[1024,1024,0,0],[2,4,8,16],[32,64,128,256],[512,8,4,2]], "left");
  assert(win.hit2048 && win.board[0][0] === 2048, `hit2048 set when 1024+1024 merges (top-left=${win.board[0][0]})`);

  const noWin = moveBoard([[1024,2,0,0],[2,4,8,16],[32,64,128,256],[512,8,4,2]], "left");
  assert(!noWin.hit2048, "hit2048 not set without a 2048 tile");
}

// ── 7. spawn probabilities bounded to 2 = 90%, 4 = 10% ────────────────
{
  const counts = { 2: 0, 4: 0 };
  const N = 5000;
  for (let i = 0; i < N; i++) {
    const b = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
    const s = spawn(b, Math.random);
    counts[s.value]++;
  }
  const frac = counts[2] / N;
  assert(counts[2] + counts[4] === N && counts[2] === N - counts[4], `spawn only ever yields 2 or 4 (2:${counts[2]}, 4:${counts[4]})`);
  assert(Math.abs(frac - 0.9) < 0.02, `spawn distribution 2≈90% (got ${(frac * 100).toFixed(2)}%)`);
}

// ── 7b. spawn never overwrites and lands on an empty cell ─────────────
{
  const b = [[2,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
  const before = b.map((r) => r.slice());
  spawn(b, () => 0.999); // deterministic: bottom-right, value 4
  assert(b[3][3] === 4 && b[0][0] === 2, "spawn targets an empty cell without overwriting");
  assert(empties(before).length === 15 && empties(b).length === 14, "spawn reduces empty count by 1");
}

// ── 8. game over only with no empty AND no adjacent pair ──────────────
{
  const dead = [
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 4, 2],
  ];
  assert(gameOver(dead), "alternating full board is game over");

  const alivePair = [
    [2, 2, 4, 8],
    [16, 32, 64, 128],
    [256, 512, 1024, 2048],
    [2, 4, 8, 16],
  ];
  assert(!gameOver(alivePair), "board with adjacent equal pair is not over");

  const aliveEmpty = dead.map((r) => r.slice());
  aliveEmpty[0][0] = 0;
  assert(!gameOver(aliveEmpty), "board with an empty cell is not over");
}

// ── 9. score accumulation across real moves ───────────────────────────
{
  let b = [[2,2,4,4],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
  const step1 = moveBoard(b, "left");
  // row0: [2,2,4,4] → [4,8,0,0] gained 12
  b = step1.board;
  const gainedSoFar = step1.gained;
  assert(gainedSoFar === 12, `score accumulates merges (got ${gainedSoFar}, want 12)`);
  // now a move that does nothing (no change)
  const step2 = moveBoard([[4,8,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]], "left");
  assert(step2.moved === false && step2.gained === 0, "redundant move adds no score");
}

// ── 10. full-board end-game check: spawn into single empty then verify ─
{
  const b = [
    [2, 4, 8, 16],
    [32, 64, 128, 256],
    [512, 1024, 2048, 4],
    [8, 16, 32, 0],
  ];
  // spawn a 2 in the only empty spot — bottom-right; then that board has
  // no empty and no equal neighbors except possibly the new 2 next to 4/32.
  spawn(b, () => 0.55); // pick index 0 of empties (bottom-right)
  // note: the "single empty" goes to exactly {(3,3)}, value can be 2 (90%)
  // or 4 (10%). Either way the smoke only tests that empties() contracts.
  assert(empties(b).length === 0, "spawn fills the last empty cell");
  // only equal-neighbor escapes are 4 (above the new tile) or 32 (left of it)
  const v = b[3][3];
  assert(gameOver(b) === (v !== 4 && v !== 32), `game-over verdict accounts for the spawned tile's value (v=${v})`);
}

console.log("\nALL 2048 SMOKE CHECKS PASSED");
