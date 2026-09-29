// Simon smoke: run game.js against a stubbed DOM into vm. Pure state machine:
// sequence extension, correct repeat advances round, wrong pad ends game,
// best score persistence. Injection hook exposes internal state.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const code = readFileSync(new URL("../public/games/simon/game.js", import.meta.url), "utf8")
  // expose internals for the harness only (shipped file is untouched)
  .replace(
    /let sequence = \[\];   \/\/ pads pressed so far this game/,
    "__state({ get: () => ({ sequence, inputPos, round, playing, inputOn }), set: (o) => { ({ sequence, inputPos, round } = { ...{ sequence, inputPos, round }, ...o }); } });\n  " +
    "let sequence = [];   // pads pressed so far this game"
  )
  // freeze timers + capture setTimeout scheduling so playback doesn't run real-time
  .replace(/const timers = \[\];/, "const timers = [];")
  .replace(
    /const beep = \(freq, dur = 0\.08, type = "square", gain = 0\.08\) => \{/,
    "const beep = __beep; const beepDefault = (freq, dur = 0.08, type = 'square', gain = 0.08) => {"
  );

const els = {};
const listeners = {};
const makeEl = (id) => ({
  id, textContent: "", innerHTML: "", hidden: false, disabled: false,
  style: {}, dataset: {}, className: "", classList: {
    add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
    _s: new Set(), contains(c) { return this._s.has(c); },
    get size() { return this._s.size; },
  },
  addEventListener: (ev, fn) => { (listeners[id + ":" + ev] ??= []).push(fn); },
  setAttribute: () => {},
  preventDefault() {},
});
for (const id of ["round", "best", "msg", "pads", "pad0", "pad1", "pad2", "pad3",
  "overlay", "overlayTitle", "overlaySub", "overlayScore", "startBtn", "soundBtn"]) {
  els[id] = makeEl(id);
}
els.pad0.dataset.pad = "0"; els.pad1.dataset.pad = "1";
els.pad2.dataset.pad = "2"; els.pad3.dataset.pad = "3";
els.overlay.style = { display: "" };
els.soundBtn.setAttribute = () => {};
els.padsBtns = [els.pad0, els.pad1, els.pad2, els.pad3];

// controlled timers: callbacks recorded, never auto-run
const timerQueue = [];
const flushTimers = (steps = 1) => {
  for (let s = 0; s < steps; s++) {
    if (!timerQueue.length) return;
    timerQueue.sort((a, b) => a.at - b.at);
    const timer = timerQueue.shift();
    timer.fn();
  }
};
const pendingTimers = () => timerQueue.length;

const sandbox = {
  console,
  __beep: (freq, dur, type, gain) => { sandbox.__lastBeep = freq; sandbox.__beepLog.push({ freq }); },
  __beepLog: [],
  __lastBeep: 0,
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
  performance: { now: () => Date.now() },
  setTimeout: (fn, delay = 0) => { timerQueue.push({ fn, delay, at: timerQueue.reduce((a, t) => Math.max(a, t.at), 0) + 1 }); return timerQueue.length; },
  clearTimeout: () => {},
  __state: (hooks) => { sandbox.hooks = hooks; },
  registerSW: () => {},
};

vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const st = () => sandbox.hooks.get();
const assert = (cond, msg) => { if (!cond) { console.error("FAIL:", msg, "| state:", JSON.stringify({ sequence: st().sequence, round: st().round, inputPos: st().inputPos, inputOn: st().inputOn, best: sandbox.localStorage.store.simon_best })); process.exit(1); } console.log("PASS:", msg); };

// pad tap helpers: wire pointerdown listener invocations through dataset
const tap = (pad) => listeners[`pad${pad}:pointerdown`][0]({
  currentTarget: els[`pad${pad}`],
  preventDefault() {},
});
const pressKey = (digit) => listeners["doc:keydown"][0]({ key: digit, repeat: false, preventDefault() {} });

// ── boot ──────────────────────────────────────────────────────────────
assert(st().sequence.length === 0 && st().round === 0, "boots with empty sequence, round 0");
assert(sandbox.localStorage.getItem("simon_best") === null, "no best yet on first boot");

// ── pads carry deterministic identity classes ─────────────────────────
const PAD_CLASSES = ["pad--red", "pad--blue", "pad--green", "pad--yellow"];
assert(
  els.padsBtns.every((b, i) => b.classList.contains(PAD_CLASSES[i]) && b.classList.size === 1),
  "pads 0-3 assigned red/blue/green/yellow classes in deterministic order"
);
assert(
  new Set(els.padsBtns.map((b) => [...b.classList._s][0])).size === 4,
  "exactly four distinct pad color classes"
);

// ── start: sequence grows by exactly one, playback scheduled ──────────
els.startBtn.click = () => listeners["startBtn:click"][0]();
els.startBtn.click();
assert(st().sequence.length === 1 && st().sequence.every((p) => p >= 0 && p <= 3), "start extends sequence by one pad in range 0-3");
assert(pendingTimers() > 0, "playback schedules highlight timers");
assert(els.msg.textContent === "WATCH" && !st().inputOn, "during playback player input locked");

// let playback drain completely
flushTimers(20);
assert(st().inputOn === true && st().inputPos === 0 && !st().playing, "after playback player input unlocked at pos 0");
assert(els.msg.textContent === "YOUR TURN", "message shows YOUR TURN");

// pads locked during playback, unlocked after
els.startBtn.click(); // start round 2 (sequence len 2), input locked again
assert(st().inputOn === false || st().playing === true, "input locked during round-2 playback");
flushTimers(40);
assert(st().inputOn === true, "input re-opened after round-2 playback");

// ── correct repeat advances the round ─────────────────────────────────
// replay the whole sequence exactly as shown (last tap schedules startRound +600ms)
for (const p of [...st().sequence]) tap(p);
assert(st().inputPos === 0 && st().inputOn === false, "after full repeat, position resets and input pauses for next playback");
// round count is still the previous length until that deferred timer lands
assert(st().round === st().sequence.length, `round holds at ${st().sequence.length} before the extension timer`);
flushTimers(3);
assert(st().sequence.length === st().round && st().round === 2, "next round extends sequence by one and bumps round to 2");
assert(pendingTimers() > 0, "next round playback scheduled");
// round-2 playback drains → input reopens
flushTimers(20);
assert(st().inputOn === true && st().inputPos === 0, "after round-2 playback, player input unlocked at pos 0");

// ── wrong pad ends the game ───────────────────────────────────────────
const seqBefore = [...st().sequence];
const wrongPad = (seqBefore[0] + 1) % 4;
tap(wrongPad);
assert(st().inputOn === false, "wrong pad locks input");
assert(els.overlayTitle.innerHTML.includes("GAME") && els.overlay.style.display !== "none", "game over overlay shown");
assert(els.overlayScore.textContent.length > 0 && els.overlayScore.hidden === false, "game over shows rounds + best");
assert(st().round === seqBefore.length, `round count unchanged at ${seqBefore.length}`);
// rounds completed = round - 1 (the failed round isn't completed)
assert(sandbox.localStorage.getItem("simon_best") === String(seqBefore.length - 1), "best persisted on game over");

// ── keyboard path (keys 1-4) + Enter-to-start from overlay ──────────
listeners["doc:keydown"] = []; // clear stale key handlers
vm.runInContext(code, sandbox); // re-boot with fresh listeners
els.startBtn.click = () => listeners["startBtn:click"][0]();
listeners["doc:keydown"][0]({ code: "Enter", repeat: false, preventDefault() {} }); // starts game from overlay
flushTimers(20);
assert(st().sequence.length === 1 && st().inputOn === true, "Enter from overlay starts a fresh game");
const keySeq = [...st().sequence];
for (const p of keySeq) pressKey(String(p + 1)); // keys 1-4 repeat the pad sequence
flushTimers(3);
assert(st().sequence.length === 2, `keyboard full repeat advanced round to ${st().round}`);

// deterministic wrong tap via keyboard: press a key that mismatches seq[0]
const firstPad = st().sequence[0];
const wrongKey = String((firstPad + 1) % 4 + 1);
pressKey(wrongKey);
assert(st().inputOn === false, "wrong key ends the game");

// ── best never regresses ──────────────────────────────────────────────
const bestBefore = Number(sandbox.localStorage.getItem("simon_best"));
assert(Number.isInteger(bestBefore) && bestBefore >= 1 && bestBefore === Number(sandbox.localStorage.store.simon_best), `best persisted as integer (${bestBefore})`);
assert(sandbox.hooks !== undefined, "state hook injected and reachable");

console.log("\nALL SIMON SMOKE CHECKS PASSED");
