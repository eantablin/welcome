// Throwaway-turned-permanent smoke: run memory-pairs game.js against stubbed DOM.
// Proves: deck is 8 exact pairs, flip/match/mismatch moves, double-flip ignored,
// win overlay + best persistence (only saved when settles > 0).
import { readFileSync } from "node:fs";
import vm from "node:vm";

const code = readFileSync(new URL("../public/games/memory-pairs/game.js", import.meta.url), "utf8")
  // expose internals for the harness only (shipped file is untouched)
  .replace(
    "  let best = Number(localStorage.getItem(\"pairs_best\") ?? 0) || 0;",
    "  let best = Number(localStorage.getItem(\"pairs_best\") ?? 0) || 0;\n" +
    "  __state({ get: () => ({ deck, up, matched, moves, locked, best }), set: (o) => ({ deck, up, matched, moves, locked, best } = { ...{ deck, up, matched, moves, locked, best }, ...o }) });"
  )
  // expose pure logic for the harness (shipped file stays untouched)
  .replace(
    "  document.addEventListener(\"DOMContentLoaded\", syncHud);\n})();",
    "  document.addEventListener(\"DOMContentLoaded\", syncHud);\n\n  __flip(flip); // smoke-test hook: drives the pure flip state machine\n  __finish(finish); // smoke-test hook: fires the win overlay\n})();"
  );

// fail fast if injection missed (replace out of sync with shipped file)
if (!code.includes("__state({ get: () => ({") || !code.includes("__flip(flip)")) {
  console.error("FAIL: state injection did not land in game.js");
  process.exit(1);
}

const els = {};
const listeners = {};
const makeEl = (id) => ({
  id, textContent: "", innerHTML: "", hidden: false, disabled: false,
  style: {}, currentTarget: null,
  classList: {
    _s: new Set(),
    add(...c) { c.forEach((x) => this._s.add(x)); },
    remove(...c) { c.forEach((x) => this._s.delete(x)); },
    contains(c) { return this._s.has(c); },
  },
  addEventListener: (ev, fn) => { (listeners[id + ":" + ev] ??= []).push(fn); },
  setAttribute: () => {},
});
const gridEl = {
  ...makeEl("grid"),
  querySelectorAll: () => Array.from({ length: 16 }, (_, i) => els["cell" + i] ?? (els["cell" + i] = makeEl("cell" + i))),
};
els.grid = gridEl;
for (const id of ["moves", "best", "overlay", "overlayScore", "startBtn", "soundBtn"]) els[id] = makeEl(id);
els.startBtn.click = () => listeners["startBtn:click"][0]();

let timers = [];
const flushTimers = () => { const t = timers; timers = []; for (const fn of t) fn(); };

const sandbox = {
  console,
  document: {
    documentElement: { dataset: {} },
    getElementById: (id) => els[id] ?? makeEl(id),
    querySelector: () => null,
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
  setTimeout: (fn, ms) => { timers.push(fn); return timers.length; },
  AudioContext: function () { this.currentTime = 0; this.resume = () => {}; this.createOscillator = () => ({ type: "", frequency: { setValueAtTime() {} }, connect: (x) => x, start() {}, stop() {} }); this.createGain = () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (x) => x }); this.destination = {}; },
  __state: (hooks) => { sandbox.hooks = hooks; },
  __flip: (fn) => { sandbox.flip = fn; },
  __finish: (fn) => { sandbox.finish = fn; },
};

vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const st = () => sandbox.hooks.get();
const set = (o) => sandbox.hooks.set(o);
const assert = (cond, msg, extra) => {
  if (!cond) {
    console.error("FAIL:", msg, "| state:", JSON.stringify({ moves: st().moves, locked: st().locked, best: st().best, up: st().up, ...extra }));
    process.exit(1);
  }
  console.log("PASS:", msg);
};

const idxOf = (glyph) => st().deck.indexOf(glyph); // first index of a glyph

// ── boot & layout ─────────────────────────────────────────────────────
els.startBtn.click();
const d0 = st().deck;
assert(d0.length === 16 && new Set(d0).size === 8 && RANKS_SUITS_COVERAGE(d0), "deck holds 16 cards: 8 random glyphs, each exactly twice");
assert(st().moves === 0 && st().up.length === 0 && st().matched.filter(Boolean).length === 0, "fresh game: 0 moves, nothing up/matched");
function RANKS_SUITS_COVERAGE(deck) {
  const counts = {};
  for (const g of deck) counts[g] = (counts[g] ?? 0) + 1;
  return (
    Object.keys(counts).length === 8 &&
    Object.values(counts).every((v) => v === 2)
  );
}

// ── matching pair: stays revealed + move++ ───────────────────────────
const g = d0[0];
const gi2 = d0.indexOf(g, 1); // second copy
sandbox.flip(0);
assert(st().up.length === 1 && st().up[0] === 0, "first flip registers, one card up");
sandbox.flip(gi2);
assert(st().moves === 1, "match → move count 1");
assert(st().up.length === 0, "match → face-up cleared");
assert(st().matched[0] === true && st().matched[gi2] === true, "match → both stay matched/inverted");

// ── mismatch: resets + extra move + input locked during 650ms ─────────
const other = ["A", "K", "Q", "J"].flatMap((r) => ["♠", "♥", "♦", "♣"].map((s) => r + s)).find((x) => x !== d0[0]);
const other2 = Object.keys(d0.reduce((m, g2) => (m[g2] = 1, m), {})).find((x) => x !== d0[0] && x !== other);
const p = d0.indexOf(other), q = d0.indexOf(other2);
sandbox.flip(p);
assert(st().locked === false && st().up.length === 1, "one card up: input not locked");
sandbox.flip(q);
assert(st().up.length === 2, "second face-up registered");
assert(st().locked === true, "mismatch → input locked");
assert(st().moves === 2, "mismatch → move count 2");
flushTimers(); // 650ms elapses
assert(st().locked === false && st().up.length === 0, "mismatch → flipped back, input unlocked");

// ── double-flip same card ignored ────────────────────────────────────
sandbox.flip(p);
const upBefore = st().up.length;
sandbox.flip(p);
assert(st().up.length === upBefore && st().moves === 2, "double-flip same card ignored");

// ── guarded flip on matched/unmatched edge cases ─────────────────────
// flip a matched card → no-op (one card is still up from the double-flip test)
const matchedIdx = st().matched.findIndex(Boolean);
assert(matchedIdx >= 0, "a matched pair exists from earlier match step");
const upLenBefore = st().up.length;
const movesBefore = st().moves;
sandbox.flip(matchedIdx);
assert(st().up.length === upLenBefore && st().moves === movesBefore, "flipping a matched card is a no-op");

// ── play out: mismatch on locked input ───────────────────────────────
flushTimers(); // clear any pending flip-back
set({ locked: false, up: [] });
const unmatched = [];
for (let i = 0; i < 16; i++) if (!st().matched[i]) unmatched.push(i);
const m1 = unmatched[0];
const m2 = unmatched.find((i) => i !== m1 && st().deck[i] !== st().deck[m1]);
sandbox.flip(m1);
sandbox.flip(m2); // different glyphs → mismatch → locked
assert(st().locked === true, "mismatch locks input");
const movesLocked = st().moves;
const upLenLocked = st().up.length;
sandbox.flip(unmatched[2] ?? m1); // locked, must be ignored
assert(st().locked === true && st().up.length === upLenLocked && st().moves === movesLocked, "input locked during mismatch wait (no extra flips)");
flushTimers(); // 650ms elapses
assert(st().locked === false && st().up.length === 0, "flip-back unlocks input");

// ── win: force rest of board to match, verify best persistence ───────
flushTimers(); // clear pending 650ms timers
set({ locked: false, up: [] });
const mm = st().matched;
const remaining = [];
for (let i = 0; i < 16; i++) if (!mm[i]) remaining.push(i);
// pair remaining cards by glyph
const byGlyph = {};
for (const i of remaining) (byGlyph[d0[i]] ??= []).push(i);
for (const [glyph, pair] of Object.entries(byGlyph)) {
  sandbox.flip(pair[0]);
  sandbox.flip(pair[1]);
  assert(st().matched[pair[0]] === true && st().matched[pair[1]] === true, "pair " + glyph + " matched");
}
assert(st().moves === 3 + Object.keys(byGlyph).length, "total moves counted");

// win fires via finish() timer → this move count is lower bound of best
console.log("— moves at win:", st().moves);

// ── best persistence: reset state, force low move win, compare ───────
flushTimers(); // discard finish queued by the 10-move win above
set({ moves: 0, locked: false, up: [], matched: new Array(16).fill(false) });
// force a full-match sweep with exactly 8 moves over the live deck
const dk = st().deck;
const byG = {};
for (let i = 0; i < 16; i++) (byG[dk[i]] ??= []).push(i);
for (const pair of Object.values(byG)) {
  sandbox.flip(pair[0]);
  sandbox.flip(pair[1]);
}
flushTimers(); // finish() fires on a 0ms timer
assert(sandbox.localStorage.store.pairs_best === "8", "8-move sweep → best=8 persisted (moves > 0)");
assert(els.overlayScore.innerHTML.includes("NEW BEST"), "overlay shows NEW BEST");
console.log("PASS: win overlay + best save when moves > 0");

// ── best NOT saved when moves == 0 ────────────────────────────────────
delete sandbox.localStorage.store.pairs_best;
set({ best: 0, moves: 0, up: [], locked: false });
sandbox.finish();
assert(!("pairs_best" in sandbox.localStorage.store), "no best saved when moves == 0");
assert(els.overlay.hidden === false && els.overlayScore.hidden === false, "win overlay shown");
assert(els.startBtn.textContent === "PLAY AGAIN", "start button becomes PLAY AGAIN");

// ── restart resets ───────────────────────────────────────────────────
els.startBtn.click();
assert(st().moves === 0 && st().up.length === 0 && st().matched.every((m) => !m), "restart resets moves/up/matched");
const nd = st().deck;
assert(nd.length === 16 && new Set(nd).size === 8 && RANKS_SUITS_COVERAGE(nd), "restart reshuffles a valid deck");

console.log("ALL MEMORY PAIRS SMOKE CHECKS PASSED");
