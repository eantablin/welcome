// Throwaway-turned-permanent smoke: run whack-a-mole game.js against a stubbed DOM.
// Proves: round start, 30s countdown, mole never repeats a hole back to back,
// whack scoring (+10, immediate relocation), whack on empty hole ignored,
// countdown expiry → round over, best persistence via localStorage.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const code = readFileSync(new URL("../public/games/whack-a-mole/game.js", import.meta.url), "utf8")
  // expose internals for the harness only (shipped file is untouched)
  .replace(
    /const updateHud = \(\) => \{/,
    "__tap({\n" +
    "    get: () => ({ score, best, phase, timeLeft, moleHole, lastHole, popLeft, start, step, whack, relocate, resetGame }),\n" +
    "    set: (o) => ({ score, best, phase, timeLeft, moleHole, lastHole, popLeft } =\n" +
    "      { score, best, phase, timeLeft, moleHole, lastHole, popLeft, ...o }),\n" +
    "  });\n" +
    "  const updateHud = () => {"
  );

const listeners = {};
const els = {};
const makeEl = (id) => ({
  id, textContent: "", innerHTML: "", hidden: false, disabled: false,
  style: {}, currentTarget: null,
  addEventListener: (ev, fn) => { (listeners[id + ":" + ev] ??= []).push(fn); },
  setAttribute: () => {},
});
for (const id of ["score", "best", "time", "overlay", "overlayTitle", "overlaySub", "overlayScore", "startBtn", "soundBtn"]) {
  els[id] = makeEl(id);
}
els.overlayTitle.innerHTML = "";
els.startBtn.click = () => listeners["startBtn:click"][0]();
els.soundBtn.click = () => listeners["soundBtn:click"][0]();

// hole buttons (m0..m8): classList state tracked for the mole render
const holes = Array.from({ length: 9 }, (_, i) => ({
  id: `m${i}`, className: "",
  classList: { toggle(cls, on) { holes[i].className = on ? cls : ""; } },
  addEventListener: (ev, fn) => { (listeners[`m${i}:${ev}`] ??= []).push(fn); },
}));

const sandbox = {
  console,
  document: {
    documentElement: { dataset: {} },
    getElementById: (id) => (/^m\d$/.test(id) ? holes[Number(id[1])] : els[id]),
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
  setTimeout: (fn) => fn(),
  requestAnimationFrame: () => 0,
  window: {},
  __tap: (hooks) => { sandbox.hooks = hooks; },
};

vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const st = () => sandbox.hooks.get();
const set = (o) => sandbox.hooks.set(o);
let failures = 0;
const assert = (cond, msg, extra = "") => {
  if (!cond) {
    failures++;
    console.error("FAIL:", msg, extra);
  } else console.log("PASS:", msg);
};

// ── boot ────────────────────────────────────────────────────────────────
assert(st().phase === "ready", 'boots in "ready" phase with overlay visible');
assert(els.overlay.hidden === false, "start overlay visible at boot");
assert(els.best.textContent === "BEST 0" && st().best === 0, "HUD shows BEST 0 at boot");

// ── round start ─────────────────────────────────────────────────────────
st().start();
assert(st().phase === "play" && st().timeLeft === 30000 && st().score === 0,
  "start: 30s round, score 0, phase play");
assert(els.overlay.hidden === true, "start hides the overlay");
assert(els.time.textContent === "30.0s" && els.score.textContent === "0",
  "HUD shows 30.0s countdown and score 0");
assert(st().moleHole >= 0 && st().moleHole <= 8, "mole spawned in a valid hole");

// ── mole spawn constraint: never the same hole twice in a row ───────────
let ok = true;
let prev = st().moleHole;
for (let i = 0; i < 300; i++) {
  st().relocate();
  if (st().moleHole === prev) { ok = false; break; }
  prev = st().moleHole;
}
assert(ok, "300 relocations never reuse the hole the mole just left");
set({ lastHole: 7, moleHole: 7 });
st().relocate();
assert(st().moleHole !== 7, "relocate from forced repeat-hole picks a different hole");
assert(st().popLeft >= 0.6 && st().popLeft <= 1.0, "relocated mole stays 600–1000ms");

// ── whack scoring ───────────────────────────────────────────────────────
set({ moleHole: 4 });
st().whack(4);
assert(st().score === 10, "whacking the mole scores +10");
assert(els.score.textContent === "10", "HUD score updates to 10");
assert(st().moleHole !== 4, "mole relocates immediately after a whack");

// ── whack on empty hole is ignored ──────────────────────────────────────
const occupied = st().moleHole;
const empty = (occupied + 1) % 9;
st().whack(empty);
assert(st().score === 10, "whacking an empty hole scores nothing");
assert(st().moleHole === occupied, "whacking an empty hole does not move the mole");

// keyboard miss path (doc keydown handler exists and ignores digits 0)
assert(listeners["doc:keydown"]?.length === 1, "document keydown handler wired");

// ── countdown expiry → round over ───────────────────────────────────────
set({ score: 10, timeLeft: 50, popLeft: 99 });
st().step(0.06);
assert(st().phase === "over", "timer expiry ends the round");
assert(els.time.textContent === "0.0s", "countdown clamps to 0.0s");
assert(els.overlay.hidden === false, "round-over overlay is shown");
assert(els.overlayScore.textContent === "SCORE 10 · BEST 10",
  "round-over overlay shows SCORE X · BEST BEST");

// ── best persistence ────────────────────────────────────────────────────
assert(sandbox.localStorage.store.whack_score === "10", "best 10 persisted as whack_score");
assert(st().best === 10 && els.best.textContent === "BEST 10", "HUD reads BEST 10");

// ── best never downgraded ───────────────────────────────────────────────
st().start();
assert(st().best === 10 && els.best.textContent === "BEST 10", "round 2 keeps BEST 10");
set({ score: 0, timeLeft: 10, popLeft: 99 });
st().step(0.02);
assert(els.overlayScore.textContent === "SCORE 0 · BEST 10", "worse round leaves best at 10");
assert(sandbox.localStorage.store.whack_score === "10", "store still holds 10 after worse round");

// ── input ignored outside play phase ────────────────────────────────────
set({ score: 0, moleHole: 3 });
const before = st().score;
st().whack(3);
assert(st().score === before && st().phase === "over", "whacks ignored while round is over");

if (failures > 0) {
  console.error(`\n${failures} FAILURE(S)`);
  process.exit(1);
}
console.log("\nALL WHACK SMOKE CHECKS PASSED");
