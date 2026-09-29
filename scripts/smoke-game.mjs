// Throwaway smoke: run the real game.js against a stubbed DOM/canvas.
// Proves: boot, start, flap, scoring, collision → game over, best-score persistence.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const code = readFileSync(new URL("../public/games/game.js", import.meta.url), "utf8")
  // expose internal state for the harness only (shipped file is untouched)
  .replace(
    "  resetGame();\n  lastT = performance.now();",
    "  __state(() => ({ bird, pipes, score, running }));\n  resetGame();\n  lastT = performance.now();"
  );
if (!code.includes("__state")) throw new Error("state hook injection failed");

// minimal 2d-context stub: records calls, no-ops fills
const ctxStub = new Proxy({}, {
  get: (t, prop) => {
    if (prop === "fillStyle") return "black";
    return (...a) => undefined; // fillRect etc.
  },
  set: () => true,
});

const listeners = {};
const els = {};
const makeEl = (id) => ({
  id,
  textContent: "",
  innerHTML: "",
  hidden: false,
  style: { display: "" },
  addEventListener: (ev, fn) => { (listeners[id + ":" + ev] ??= []).push(fn); },
  setAttribute: () => {},
  getContext: () => ctxStub,
});
for (const id of ["stage", "score", "best", "overlay", "overlayTitle", "overlaySub", "overlayScore", "installHint", "startBtn", "soundBtn"]) {
  els[id] = makeEl(id);
}

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
  AudioContext: undefined,
  setTimeout: (fn) => fn(), // make sfx chains synchronous
  __state: (fn) => { sandbox.stateFn = fn; },
};
sandbox.__state = sandbox.__state;

vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const tick = (dt) => {
  rafTime += dt;
  const fns = rafQueue.splice(0);
  for (const fn of fns) fn(rafTime);
};

const assert = (cond, msg) => { if (!cond) { console.error("FAIL:", msg); process.exit(1); } console.log("PASS:", msg); };

// boot: overlay visible, score 0
assert(els.score.textContent === "0", "boot score is 0");
assert(els.best.textContent.includes("0"), "boot best is 0");

// start via keyboard listener (doc:keydown, Space)
const keydowns = listeners["doc:keydown"];
assert(keydowns?.length === 1, "keydown handler registered");
keydowns[0]({ code: "Space", preventDefault: () => {} });
tick(16); tick(16);
assert(els.overlay.style.display === "none", "start hides overlay");

// closed-loop autopilot: track bird & pipes, flap to stay inside the nearest gap
const state = () => sandbox.stateFn();
assert(typeof state === "function", "state hook exposed");
const stepMs = 16.67;
let flapCooldown = 0;

const autopilot = () => {
  const { bird, pipes, running } = state();
  if (!running) return;
  flapCooldown -= stepMs;
  // target the vertical center of the nearest pipe's gap (or mid-air before pipes)
  const next = pipes.find((p) => p.x + 70 > 94);
  const targetY = next ? next.top + next.gap / 2 : 300;
  if (bird.y > targetY - 12 && bird.vy > 0 && flapCooldown <= 0) {
    keydowns[0]({ code: "Space", preventDefault: () => {} });
    flapCooldown = 150; // avoid multi-flap in one descent
  }
};

// simulate until score reaches 3 (proves repeated scoring + gap tracking)
let frames = 0;
while (els.score.textContent !== "3" && frames < 6000) {
  autopilot();
  tick(stepMs);
  frames++;
}
assert(els.score.textContent === "3", `scored 3 after ${frames} frames`);
assert(els.overlay.style.display === "none", "still running at score 3");

// force death: stop flapping, let bird fall
let guard = 0;
while (els.overlay.style.display !== "" && guard < 600) { tick(stepMs); guard++; }
assert(els.overlay.style.display === "", "collision shows game-over overlay");
assert(els.overlayTitle.innerHTML.includes("GAME"), "overlay shows GAME OVER");
assert(els.overlayScore.textContent.includes("SCORE"), "overlay shows score");

// best persisted in localStorage
assert(sandbox.localStorage.store.brutalbird_best === "3", "best saved to localStorage");
assert(els.best.textContent === "BEST 3", "HUD best updated");

console.log("\nALL SMOKE CHECKS PASSED");
