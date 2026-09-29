// Snake smoke: run game.js against a stubbed DOM and drive the pure step()
// state machine via an injected state hook (shipped file is untouched).
// Proves: movement, direction queue + 180° blocking, food growth + score,
// speed ramp + floor, tail-chase legality, wall death, self death, best
// persistence, and keyboard input queueing.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const code = readFileSync(new URL("../public/games/snake/game.js", import.meta.url), "utf8")
  // expose internals for the harness only
  .replace(
    /let snake, dir, queue, food, score, eaten, best, running, over, acc;/,
    "__state({\n" +
    "    get: () => ({ snake, dir, queue, food, score, eaten, best, running, over }),\n" +
    "    set: (o) => ({ snake, dir, queue, food, score, eaten, best, running, over } =\n" +
    "      { ...{ snake, dir, queue, food, score, eaten, best, running, over }, ...o }),\n" +
    "    api: () => ({ step, turn, resetGame, tickMs }),\n" +
    "  });\n" +
    "  let snake, dir, queue, food, score, eaten, best, running, over, acc;"
  );
if (!code.includes("__state")) throw new Error("state hook injection failed");

const listeners = {};
const els = {};
const makeEl = (id) => ({
  id, textContent: "", innerHTML: "", hidden: false,
  style: {},
  addEventListener: (ev, fn) => { (listeners[id + ":" + ev] ??= []).push(fn); },
  setAttribute: () => {},
});
const ctx2d = new Proxy({}, {
  get: (t, k) => (typeof k === "string" ? () => {} : undefined),
});
for (const id of ["stage", "score", "best", "overlay", "overlayTitle", "overlaySub",
  "overlayScore", "overlayHint", "startBtn", "soundBtn", "installHint"]) {
  els[id] = makeEl(id);
}
els.stage.getContext = () => ctx2d;

const sandbox = {
  console,
  document: {
    documentElement: { dataset: {} },
    getElementById: (id) => els[id] ?? makeEl(id),
    addEventListener: (ev, fn) => { (listeners["doc:" + ev] ??= []).push(fn); },
  },
  window: {},
  localStorage: {
    store: {},
    getItem(k) { return this.store[k] ?? null; },
    setItem(k, v) { this.store[k] = String(v); },
  },
  matchMedia: () => ({ matches: false }),
  location: { protocol: "https:" },
  navigator: { serviceWorker: { register: () => Promise.resolve() } },
  performance: { now: () => Date.now() },
  setTimeout: (fn) => fn(),
  requestAnimationFrame: () => 0,
  __state: (hooks) => { sandbox.hooks = hooks; },
};

vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const st = () => sandbox.hooks.get();
const api = () => sandbox.hooks.api();
const assert = (cond, msg) => {
  if (!cond) {
    console.error("FAIL:", msg, "| state:", JSON.stringify({
      head: st().snake?.[0], len: st().snake?.length, score: st().score,
      dir: st().dir, over: st().over, running: st().running,
    }));
    process.exit(1);
  }
  console.log("PASS:", msg);
};

const DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const same = (a, b) => a.x === b.x && a.y === b.y;

// ── 1. boot state ──────────────────────────────────────────────────────
assert(st().snake.length === 3 && st().score === 0 && st().best === 0,
  "boots with 3-segment snake, score 0, best 0");
assert(api().tickMs() === 140, "starting tick interval is 140ms");

// ── 2. plain movement: head advances, tail follows, length stable ─────
api().resetGame();
sandbox.hooks.set({ food: { x: 15, y: 15 } });
const hx0 = st().snake[0].x;
api().step();
assert(st().snake[0].x === hx0 + 1 && st().snake.length === 3 && st().score === 0,
  "moves one cell per step without growing");

// ── 3. 180° reversal is blocked ───────────────────────────────────────
api().resetGame();
sandbox.hooks.set({ dir: DIRS.right, queue: [], food: { x: 15, y: 15 } });
api().turn(DIRS.left); // queued, but must be rejected at dequeue time
api().step();
assert(same(st().dir, DIRS.right) && st().snake[0].x === st().snake[1].x + 1,
  "180° reversal ignored — snake keeps moving right");
assert(same(st().dir, DIRS.right), "direction still right after blocked reversal");

// ── 4. input queue: two quick turns both register in order ────────────
api().resetGame();
sandbox.hooks.set({ dir: DIRS.right, queue: [] });
api().turn(DIRS.down);
api().turn(DIRS.left);
api().step(); // right → down
assert(same(st().dir, DIRS.down), "first queued turn applied (right → down)");
api().step(); // down → left
assert(same(st().dir, DIRS.left), "second queued turn applied (down → left)");

// ── 5. food: growth, +10 score, relocation ────────────────────────────
api().resetGame();
const cy = st().snake[0].y;
sandbox.hooks.set({ food: { x: st().snake[0].x + 1, y: cy } });
api().step();
assert(st().snake.length === 4 && st().score === 10,
  "eating grows snake by 1 and scores +10");
assert(st().food && !st().snake.some((s) => same(s, st().food)),
  "new food spawns on a free cell");

// ── 6. speed ramps every 5 foods, floor at 70ms ───────────────────────
assert(api().tickMs() === 140 && Math.floor(st().eaten / 5) === 0,
  "tick still 140ms below ramp threshold");
sandbox.hooks.set({ eaten: 4, food: { x: st().snake[0].x + 1, y: st().snake[0].y } });
api().step(); // 5th food → ramp
assert(st().eaten === 5 && api().tickMs() === 130, "5th food ramps tick 140 → 130ms");
sandbox.hooks.set({ eaten: 35 });
assert(api().tickMs() === 70, "tick floor reached: 70ms at 35 foods");
sandbox.hooks.set({ eaten: 100 });
assert(api().tickMs() === 70, "tick stays clamped at 70ms beyond floor");

// ── 7. tail chase is legal (moving into the vacating tail cell) ───────
api().resetGame();
sandbox.hooks.set({
  snake: [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }],
  dir: DIRS.down, queue: [], food: { x: 0, y: 0 },
});
api().step();
assert(!st().over && st().snake.length === 4 && same(st().snake[0], { x: 5, y: 6 }),
  "moving into the vacating tail cell is not a collision");

// ── 8. self collision kills ───────────────────────────────────────────
api().resetGame();
sandbox.hooks.set({
  snake: [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 4 }, { x: 5, y: 4 }],
  dir: DIRS.right, queue: [], food: { x: 0, y: 0 },
});
api().step();
assert(st().over && !st().running, "running into own body is fatal");

// ── 9. wall death + best persistence ──────────────────────────────────
api().resetGame();
sandbox.hooks.set({
  snake: [{ x: 19, y: 10 }, { x: 18, y: 10 }, { x: 17, y: 10 }],
  dir: DIRS.right, queue: [], score: 30, food: { x: 2, y: 2 },
});
api().step();
assert(st().over && !st().running, "hitting the wall is fatal");
assert(els.overlayTitle.innerHTML.includes("GAME") && els.overlayScore.textContent.includes("SCORE 30"),
  "game over overlay shows final score");
assert(sandbox.localStorage.store.snake_best === "30" && st().best === 30 &&
  els.best.textContent.includes("30"),
  "best score persisted to localStorage and HUD");

// ── 10. best survives reset ───────────────────────────────────────────
api().resetGame();
assert(st().best === 30, "best score survives a reset");

// ── 11. keyboard: space starts, WASD/arrows queue turns ───────────────
listeners["doc:keydown"][0]({ code: "Space", preventDefault() {} });
assert(st().running && els.overlay.style.display === "none",
  "space starts the game and hides the overlay");
listeners["doc:keydown"][0]({ code: "KeyW", preventDefault() {} });
listeners["doc:keydown"][0]({ code: "ArrowLeft", preventDefault() {} });
assert(st().queue.length === 2 && same(st().queue[0], DIRS.up) && same(st().queue[1], DIRS.left),
  "WASD and arrow keys both queue turns (two quick turns register)");

console.log("\nALL SNAKE SMOKE CHECKS PASSED");
