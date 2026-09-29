// Throwaway-turned-permanent smoke: run raycaster game.js against a stubbed DOM.
// Proves: castRay hit distance + side on hand-computed grid-aligned angles,
// wall collision (blocked + sliding), dt scaling (2x dt → 2x displacement),
// exit-cell detection via the real game map, and NEW GAME restart.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const code = readFileSync(new URL("../public/games/raycaster/game.js", import.meta.url), "utf8")
  // expose internals for the harness only (shipped file is untouched)
  .replace(
    /  let px, py, dir, elapsed, running, lastT;/,
    "  __state({ get: () => ({ px, py, dir, elapsed, running }), set: (o) => ({ px, py, dir, elapsed, running } = { ...{ px, py, dir, elapsed, running }, ...o }) });\n" +
    "  let px, py, dir, elapsed, running, lastT;"
  )
  .replace(
    /  \/\/ ── boot ──/,
    "  globalThis.__drive__ = { step, start, reset, draw, keys, touch };\n" +
    "  // ── boot ──"
  );

const listeners = {};
const els = {};
const ctxStub = { paints: 0, fillStyle: "", fillRect() { this.paints++; } };
const makeEl = (id) => ({
  id, textContent: "", innerHTML: "", hidden: false, disabled: false,
  style: {},
  addEventListener: (ev, fn) => { (listeners[id + ":" + ev] ??= []).push(fn); },
  setAttribute: () => {},
  getContext: () => ctxStub,
});
for (const id of ["clock", "best", "stage", "overlay", "overlayTitle", "overlaySub", "overlayScore", "installHint", "startBtn", "soundBtn"]) {
  els[id] = makeEl(id);
}

const sandbox = {
  console,
  document: {
    documentElement: { dataset: {} },
    getElementById: (id) => els[id] ?? makeEl(id),
    querySelectorAll: () => [],
    addEventListener: (ev, fn) => { (listeners["doc:" + ev] ??= []).push(fn); },
  },
  localStorage: {
    store: {},
    getItem(k) { return this.store[k] ?? null; },
    setItem(k, v) { this.store[k] = String(v); },
  },
  matchMedia: () => ({ matches: false }),
  location: { protocol: "https:" },
  navigator: { serviceWorker: { register: () => Promise.resolve() } },
  performance: { now: () => Date.now() },
  requestAnimationFrame: () => 0,
  setTimeout: (fn) => fn(),
  window: {},
  __state: (hooks) => { sandbox.hooks = hooks; },
};

vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const st = () => sandbox.hooks.get();
const drive = sandbox.__drive__;
const core = sandbox.__rays_core__;
const assert = (cond, msg) => { if (!cond) { console.error("FAIL:", msg, "| state:", JSON.stringify({ px: st().px, py: st().py, dir: st().dir, running: st().running })); process.exit(1); } console.log("PASS:", msg); };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// ── castRay: hand-computed distances on a known tiny map ────────────
// map[y][x], y = row: 1 = wall block
const tinyMap = [
  "111",
  "101",
  "111",
];
// player at cell-center (1.5, 1.5): every cardinal ray hits a wall 0.5 away
const rN = core.castRay(1.5, 1.5, -Math.PI / 2, tinyMap);
assert(near(rN.dist, 0.5), `ray north hits wall 0.5 cells away (dist=${rN.dist})`);
assert(rN.vert === false, "ray north crosses a horizontal grid line (vert=false)");

const rS = core.castRay(1.5, 1.5, Math.PI / 2, tinyMap);
assert(near(rS.dist, 0.5), `ray south hits wall 0.5 cells away (dist=${rS.dist})`);

const rE = core.castRay(1.5, 1.5, 0, tinyMap);
assert(near(rE.dist, 0.5), `ray east hits wall 0.5 cells away (dist=${rE.dist})`);
assert(rE.vert === true, "ray east crosses a vertical grid line (vert=true)");

const rW = core.castRay(1.5, 1.5, Math.PI, tinyMap);
assert(near(rW.dist, 0.5) && rW.vert === true, "ray west hits wall 0.5 cells away (vert=true)");

// ray out of the map terminates with a finite distance (fallback "#" cells)
const rOut = core.castRay(0.5, 0.5, -Math.PI, tinyMap);
assert(Number.isFinite(rOut.dist) && rOut.dist > 0, `out-of-map ray terminates (dist=${rOut.dist})`);

// 45° diagonal in the 3x3 map: hits corner cell (2,2); euclidean distance
// from (1.5,1.5) to the x=2/y=2 crossing is √(0.5² + 0.5²) ≈ 0.7071
const rDiag = core.castRay(1.5, 1.5, Math.PI / 4, tinyMap);
assert(near(rDiag.dist, Math.SQRT1_2, 1e-6), `ray at 45° hits far corner (dist=${rDiag.dist.toFixed(4)})`);

// ── collision: blocked + sliding ─────────────────────────────────────
const room = [
  "11111111",
  "1      1",
  "1      1",
  "1      1",
  "1      1",
  "1      1",
  "1      1",
  "11111111",
];
// walking north into the wall from row 1 is refused…
const blockedStep = core.move(4.5, 1.5, -Math.PI / 2, 1, 0, 0.5, room);
assert(blockedStep.py === 1.5, `forward into wall blocked (py stays ${blockedStep.py})`);
// …but sliding east along that same wall still works
const slideStep = core.move(4.5, 1.5, 0, 1, 0, 0.5, room);
assert(near(slideStep.px, 4.5 + 2.2 * 0.5) && slideStep.py === 1.5, "slides along wall: forward step moves px, py unchanged");
// and a strafe into the wall is blocked while the axis-parallel part still slides
const strafeBlocked = core.move(4.5, 1.5, 0, 0, -1, 0.5, room);
assert(strafeBlocked.py === 1.5, "strafe into wall blocked");

// ── dt scaling: same step, 2x dt → 2x displacement ───────────────────
const half = core.move(4.5, 4.0, 0, 1, 0, 0.25, room);
const full = core.move(4.5, 4.0, 0, 1, 0, 0.5, room);
const m1 = half.px - 4.5, m2 = full.px - 4.5;
assert(m1 > 0 && near(m2, 2 * m1, 1e-9), `dt scaling: 2x dt = 2x displacement (${m2.toFixed(4)} vs 2*${m1.toFixed(4)})`);

// ── exit detection: step() into the E cell wins via the real map ─────
// real MAP: E at row 10, col 13 → center (13.5, 10.5)
sandbox.hooks.set({ px: 13.5, py: 10.5, dir: 0, elapsed: 4.2, running: true });
drive.step(0.016);
const won = st();
assert(won.running === false, "stepping onto the E cell ends the run");
assert(els.overlayTitle.textContent.toUpperCase().includes("CLEAR"), `overlay shows LEVEL CLEAR ("${els.overlayTitle.textContent}")`);
assert(els.overlayScore.textContent.includes("TIME 4.2S"), `overlay shows the run time ("${els.overlayScore.textContent}")`);
assert(near(Number(sandbox.localStorage.store.raycaster_best), 4.2, 1e-9), "best time persisted to localStorage");

// ── NEW GAME restarts ────────────────────────────────────────────────
listeners["startBtn:click"][0]();
const restarted = st();
assert(restarted.running === true && restarted.elapsed === 0, "NEW GAME restarts: running, timer reset");
assert(restarted.px === 2.5 && restarted.py === 2.5, "NEW GAME respawns the player");

// ── renderer: draw() paints columns on the 320x200 canvas ────────────
ctxStub.paints = 0;
drive.draw();
assert(ctxStub.paints > 100, `draw() rasterizes the scene (${ctxStub.paints} fillRect calls)`);
ctxStub.paints = 0;
sandbox.hooks.set({ px: 13.0, py: 10.5 }); // standing next to the exit wall
drive.draw();
assert(ctxStub.paints > 100, "draw() survives wall-hugging viewpoints");

// ── level map is solvable: BFS from spawn to the E cell ──────────────
const solvable = (() => {
  const grid = core.cellAt;
  const startCell = [2, 2]; // spawn (2.5, 2.5)
  const goal = [13, 10];    // E cell
  const seen = new Set([startCell.join(",")]);
  const q = [startCell];
  while (q.length) {
    const [cx, cy] = q.shift();
    if (cx === goal[0] && cy === goal[1]) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy, key = nx + "," + ny;
      if (!seen.has(key) && grid(nx, ny) !== "1") { seen.add(key); q.push([nx, ny]); }
    }
  }
  return false;
})();
assert(solvable, "real 16x16 map: a walkable path exists from spawn to E");

// ── icon-draw module loads and produces canvases for the generator ───
const icon = await import(new URL("../public/games/raycaster/icon-draw.mjs", import.meta.url).href);
for (const [size, maskable] of [[192, false], [512, false], [192, true], [512, true]]) {
  const canvas = icon.draw(size, maskable);
  assert(canvas.rgba.length === size * size * 4, `icon draw(${size}, maskable=${maskable}) renders a ${size}x${size} canvas`);
}
const flat = icon.draw(8, false);
assert(flat.rgba.every((b, i) => i % 4 === 3 ? b === 255 : [0, 255].includes(b)), "icon palette is strictly monochrome");

console.log("\nALL RAYCASTER SMOKE CHECKS PASSED");
