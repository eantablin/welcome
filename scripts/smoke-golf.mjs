// Golf smoke: test the PURE game core exposed by game.js (globalThis.GolfCore)
// in node:vm, plus the real game loop driven through an injected state hook.
// Proves: level parsing (9 holes, par 2–4, one ball + one hole each),
// friction monotonically decays speed until stop, wall bounce reflects
// exactly one axis and conserves the other, capture requires near AND slow,
// stroke counting, hole/complete flow, and 9-hole total-vs-par math with
// best-total persistence.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const code = readFileSync(new URL("../public/games/brutal-golf/game.js", import.meta.url), "utf8");

// Inject a state hook at the boot lines (shipped file is untouched).
const hooked = code.replace(
  "  resetCourse();\n  lastT = performance.now();",
  "  __hooks({\n" +
  "    get: () => ({ levelIndex, strokes, total, phase, ball, velocity, holeScores, best }),\n" +
  "    putt: (dir, power01) => launch(dir, power01),\n" +
  "  });\n" +
  "  resetCourse();\n  lastT = performance.now();"
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
for (const id of ["stage", "holeChip", "strokesChip", "best", "overlay", "overlayTitle", "overlaySub", "overlayScore", "installHint", "startBtn", "soundBtn"]) {
  els[id] = makeEl(id);
}
els.startBtn.click = () => listeners["startBtn:click"][0]();

const rafQueue = [];
let rafTime = 0;

const sandbox = {
  console,
  document: {
    documentElement: { dataset: {} },
    getElementById: (id) => els[id] ?? makeEl(id),
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
  performance: { now: () => rafTime },
  requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
  setTimeout: (fn) => fn(), // make sfx chains synchronous
};
sandbox.__hooks = (fn) => { sandbox.hooks = fn; };

vm.createContext(sandbox);
vm.runInContext(hooked, sandbox);

const core = sandbox.GolfCore;
if (!core) throw new Error("GolfCore not exposed — pure core marker missing");
const { GRID, FRICTION, STOP_SPEED, BALL_R, HOLE_R, CAPTURE_SPEED, MAX_POWER,
        HOLES, parseLevel, bounce, stepBall, totalVsPar } = core;

const hooks = sandbox.hooks;
const st = () => hooks.get();

let failed = 0;
const assert = (cond, msg) => {
  if (!cond) { console.error("FAIL:", msg); failed++; return; }
  console.log("PASS:", msg);
};

// ═══ 1. level parsing: 9 holes, par 2–4, exactly one ball + one hole ═══
const course = HOLES.map(parseLevel);
assert(course.length === 9 &&
       course.every((l) => l.par >= 2 && l.par <= 4) &&
       course.every((l) => l.ball && l.hole && (l.ball.x !== l.hole.x || l.ball.y !== l.hole.y)) &&
       course.every((l) => l.walls.length > 0),
  "9 levels parsed: par 2–4, one ball + one hole each, walls present");
assert(course.every((l) => l.w === 480 && l.h === 640),
  "every level fills the logical 480x640 canvas (32px grid)");
assert(course.every((l) => l.walls.every((r) => r.w === GRID && r.h === GRID)),
  "walls are 32px grid blocks");

// ═══ 2. friction monotonically reduces speed until the ball stops ═════
{
  const lvl = course[0];
  const away = { x: lvl.w / 2, y: 32 + 20 }; // open floor, far from walls/hole
  let b = away, v = { x: 6, y: 0 };
  const speeds = [];
  let stopped = false;
  for (let i = 0; i < 400; i++) {
    const r = stepBall(b, v, [], { x: -9999, y: -9999 });
    speeds.push(Math.hypot(r.v.x, r.v.y));
    b = r.ball; v = r.v;
    if (r.stopped) { stopped = true; break; }
  }
  const monotone = speeds.slice(0, -1).every((s, i) => s > speeds[i + 1]);
  assert(speeds.length > 50 && monotone, `friction decays speed strictly monotonically for ${speeds.length} frames`);
  assert(stopped && v.x === 0 && v.y === 0, "ball comes to a complete stop under friction");
}

// ═══ 3. wall bounce: exactly one axis negated, the other conserved ════
{
  const wallLeft = { x: 0, y: 0, w: 32, h: 320 };
  const ballAt = { x: 20, y: 160 };
  const bv = bounce({ x: 5, y: 3 }, ballAt, wallLeft);
  assert(bv.x === -5 && bv.y === 3, "vertical wall bounce negates x only, conserves y");
  const wallTop = { x: 0, y: 0, w: 320, h: 32 };
  const hv = bounce({ x: -4, y: -6 }, { x: 160, y: 20 }, wallTop);
  assert(hv.x === -4 && hv.y === 6, "horizontal wall bounce negates y only, conserves x");
  // through stepBall: a ball rolling toward the wall from open floor bounces out
  const r = stepBall(
    { x: 48, y: 160 }, { x: -14, y: 0 },
    [wallLeft], { x: -9999, y: -9999 }
  );
  assert(r.v.x > 0 && r.ball.x >= 32 + BALL_R, "stepBall reflects off the wall instead of entering it");
}

// ═══ 4. capture requires near AND slow ════════════════════════════════
{
  const hole = { x: 240, y: 240 };
  const slow = { x: 0, y: 0, w: 0, h: 0 }; // no walls
  const nearSlow = stepBall({ x: hole.x - 8, y: hole.y }, { x: 2, y: 1 }, [], hole);
  assert(nearSlow.sunk === true, "near + slow → sunk");
  const nearFast = stepBall({ x: hole.x - 20, y: hole.y }, { x: 12, y: 0 }, [], hole);
  assert(nearFast.sunk === false && !nearFast.stopped, "near but fast → NOT sunk, ball keeps rolling");
  const farSlow = stepBall({ x: hole.x - 40, y: hole.y }, { x: 2, y: 0 }, [], hole);
  assert(farSlow.sunk === false && farSlow.stopped === true, "far but slow → NOT sunk, ball stops");
  // boundary math: capture radius circle (dx²+dy²), not a square
  const corner = stepBall({ x: hole.x + 9, y: hole.y + 9 }, { x: 1, y: 1 }, [], hole);
  assert(corner.sunk === false, "diagonal distance beyond radius → NOT sunk (circular capture)");
}

// ═══ 5. total-vs-par math ═════════════════════════════════════════════
{
  const pars = course.map((l) => l.par);
  const sumPar = pars.reduce((a, b) => a + b, 0);
  assert(sumPar >= 18 && sumPar <= 36, `total course par is sane (${sumPar})`);
  assert(totalVsPar([2, 3, 2, 5], course) === 0 + 1 - 1 + 2, "totalVsPar sums signed per-hole diffs");
  assert(totalVsPar([2, 2, 2, 2, 2, 2, 2, 2, 2], course) === 18 - sumPar,
    `all-par 2s vs course pars → ${18 - sumPar}`);
  assert(totalVsPar([pars.reduce((a, b) => a + b, 0)], course.slice(0, 1)) === pars.reduce((a, b) => a + b, 0) - course[0].par,
    "single-hole total matches strokes-minus-par");
}

// ═══ drive the real game loop (rAF ticks) through an honest putt ══════
const tick = (dtMs = 1000 / 60) => {
  rafTime += dtMs;
  const fns = rafQueue.splice(0);
  for (const fn of fns) fn(rafTime);
};
const runOut = (maxFrames = 2000) => {
  let f = 0;
  while (f < maxFrames) {
    const s = st();
    if (s.phase !== "play") return "done";
    if (s.velocity.x === 0 && s.velocity.y === 0) return "stopped";
    tick();
    f++;
  }
  return "timeout";
};

// choose launch speed so the ball STOPS at (or just past) the hole:
// simulated stop distance must land within the capture radius.
const stopDistance = (v0) => {
  let v = v0, d = 0;
  while (v >= STOP_SPEED && d < 5000) { v *= FRICTION; d += v; }
  return d;
};
const powerFor = (dist) => {
  let lo = 1 / MAX_POWER, hi = 1;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (stopDistance(mid * MAX_POWER) < dist) lo = mid; else hi = mid;
  }
  return hi;
};

// hole 1: ball and hole share a row → straight putt scaffolds the flow
{
  const lvl = course[0];
  assert(els.overlay.style.display !== "none" && st().phase === "title", "boots on title overlay");
  els.startBtn.click();
  assert(els.overlay.style.display === "none" && st().phase === "play", "start hides overlay and enters play");
  assert(els.holeChip.textContent === "HOLE 1 PAR 2", "HUD shows HOLE 1 PAR 2");

  const dist = Math.hypot(lvl.hole.x - st().ball.x, lvl.hole.y - st().ball.y);
  const ok = hooks.putt({ x: (lvl.hole.x - st().ball.x) / dist, y: (lvl.hole.y - st().ball.y) / dist }, powerFor(dist - 2));
  assert(ok === true && st().strokes === 1 && els.strokesChip.textContent === "STROKES 1", "launch counts 1 stroke, HUD syncs");
  const res = runUntilStoppedOrDone(2000);
  assert(res === "done" && st().phase === "holeDone", "ball sinks → hole-complete overlay");
  assert(els.overlayTitle.innerHTML.includes("1"), "overlay names the completed hole");
  assert(st().holeScores[0] === 1 && st().total === -1, "hole score + total recorded (1 stroke on par 2 → −1)");

  els.startBtn.click();
  assert(st().phase === "play" && st().levelIndex === 1 && els.holeChip.textContent.includes("HOLE 2"), "NEXT advances to hole 2 with fresh state");
}

// ═══ full course: autopilot putts all 9 holes ═════════════════════════
{
  let attempts = 0;
  const puttTowardHole = () => {
    const s = st();
    const lvl = course[s.levelIndex];
    const dx = lvl.hole.x - s.ball.x, dy = lvl.hole.y - s.ball.y;
    const d = Math.hypot(dx, dy);
    // tiny deterministic jitter escapes corner ricochet loops
    const ang = Math.sin(attempts * 1.7) * 0.2;
    const rot = { x: dx * Math.cos(ang) - dy * Math.sin(ang), y: dx * Math.sin(ang) + dy * Math.cos(ang) };
    const len = Math.hypot(rot.x, rot.y);
    hooks.putt({ x: rot.x / len, y: rot.y / len }, powerFor(d));
    attempts++;
  };

  let guard = 0;
  while (st().phase !== "courseDone" && guard < 2000) {
    guard++;
    const s = st();
    if (s.phase === "holeDone") { els.startBtn.click(); continue; }
    const r = runUntilStoppedOrDone(2500);
    if (r === "timeout") break;
    if (st().phase === "play") puttTowardHole();
  }
  assert(st().phase === "courseDone", `autopilot plays all 9 holes (${guard} loop iterations, ${attempts} putts total)`);
  const s = st();
  const expectTotal = s.holeScores.reduce((t, k, i) => t + (k - course[i].par), 0);
  assert(s.total === expectTotal, `total equals Σ(strokes − par) = ${expectTotal}`);
  assert(s.holeScores.length === 9, "all 9 holes recorded");
  assert(sandbox.localStorage.store.golf_best === String(s.total), "best total persisted to localStorage golf_best");
  assert(els.overlayScore.textContent.includes("TOTAL"), "course overlay shows total vs par");
}

function runUntilStoppedOrDone(maxFrames) { return _run(maxFrames); }
function _run(maxFrames = 2000) {
  let f = 0;
  while (f < maxFrames) {
    const s = st();
    if (s.phase !== "play") return "done";
    if (s.velocity.x === 0 && s.velocity.y === 0) return "stopped";
    tick();
    f++;
  }
  return "timeout";
}

if (failed > 0) process.exit(1);
console.log("\nALL GOLF SMOKE CHECKS PASSED");
