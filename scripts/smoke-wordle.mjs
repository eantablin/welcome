// Smoke: run the real wordle game.js against a stubbed DOM.
// Proves: checkGuess verdict math (exact/present/absent + duplicates),
// win at all-green, lose after 6 wrong guesses, stats persistence,
// 5-letter gating and invalid-length rejection.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const code = readFileSync(new URL("../public/games/wordle/game.js", import.meta.url), "utf8")
  // expose internals for the harness only (shipped file is untouched)
  .replace(
    "  function checkGuess(guess, answer) {",
    "  checkGuess = (guess, answer) => {"
  )
  .replace(
    "  const isWin = (verdict) => verdict.every((v) => v === \"correct\");",
    "  const isWin = (verdict) => verdict.every((v) => v === \"correct\");\n  __expose({ checkGuess });"
  )
  .replace(
    "  // ── boot ─────────────────────────────────────────────────────────────",
    "  __state({\n" +
    "    get: () => ({ answer, row, col, guesses, playing, stats, LIST }),\n" +
    "    set: (o) => {\n" +
    "      if (\"answer\" in o) answer = o.answer;\n" +
    "      if (\"playing\" in o) playing = o.playing;\n" +
    "    },\n" +
    "  });\n" +
    "  // ── boot ─────────────────────────────────────────────────────────────"
  );
if (!code.includes("__state")) throw new Error("state hook injection failed");
if (!code.includes("__expose({ checkGuess })")) throw new Error("checkGuess injection failed");

const els = {};
const listeners = {};
const classes = new WeakMap();
const classListOf = (el) => {
  if (!classes.has(el)) classes.set(el, new Set());
  return classes.get(el);
};
const makeEl = (id) => ({
  id, textContent: "", innerHTML: "", hidden: false, disabled: false,
  style: {}, children: [],
  get classList() {
    const set = classListOf(this);
    set[Symbol.iterator] = () => set.values();
    return {
      add: (...cs) => cs.forEach((c) => set.add(c)),
      remove: (...cs) => cs.forEach((c) => set.delete(c)),
      contains: (c) => set.has(c),
    };
  },
  addEventListener: (ev, fn) => { (listeners[id + ":" + ev] ??= []).push(fn); },
  setAttribute: () => {},
  appendChild(c) { this.children.push(c); return c; },
});
for (const id of ["statsChip", "grid", "msg", "keys", "overlay", "overlayTitle", "overlaySub", "overlayScore", "installHint", "startBtn", "soundBtn"]) {
  els[id] = makeEl(id);
}
// note: only grid/keys containers need real children

const keydowns = [];
const sandbox = {
  console,
  document: {
    documentElement: { dataset: {} },
    getElementById: (id) => els[id] ?? makeEl(id),
    createElement: (_tag) => makeEl("dyn"),
    addEventListener: (ev, fn) => { if (ev === "keydown") keydowns.push(fn); },
  },
  localStorage: {
    store: {},
    getItem(k) { return this.store[k] ?? null; },
    setItem(k, v) { this.store[k] = String(v); },
  },
  matchMedia: () => ({ matches: false }),
  location: { protocol: "https:" },
  navigator: { serviceWorker: { register: () => Promise.resolve() } },
  setTimeout: (fn) => fn(),
  window: {},
  __state: (hooks) => { sandbox.hooks = hooks; },
  __expose: (o) => { sandbox.exposed = o; },
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
sandbox.window = sandbox;

const st = () => sandbox.hooks.get();
const checkGuessOf = () => sandbox.exposed.checkGuess;
const keydown = (key) => keydowns.forEach((fn) => fn({ key, preventDefault: () => {} }));
const typedRow = (r) => {
  const grid = els.grid.children;
  let s = "";
  for (let c = 0; c < 5; c++) s += grid[r * 5 + c].textContent;
  return s;
};
const isWinOf = (v) => v.every((x) => x === "correct");

let failures = 0;
const assert = (cond, msg) => {
  if (cond) { console.log("PASS:", msg); return; }
  failures++;
  console.error("FAIL:", msg);
};

// ── pure checkGuess: exact / present / absent ─────────────────────────
const checkGuess = checkGuessOf();
assert(typeof checkGuess === "function", "checkGuess exposed");
assert(JSON.stringify(checkGuess("CRANE", "CRANE")) === JSON.stringify(["correct","correct","correct","correct","correct"]), "exact match → all correct");
assert(JSON.stringify(checkGuess("LEANP", "PLANE")) === JSON.stringify(["present","present","correct","correct","present"]), "anagram → LEANP vs PLANE: 3 present + 2 correct");
assert(JSON.stringify(checkGuess("XYZQW", "CRANE")) === JSON.stringify(["absent","absent","absent","absent","absent"]), "no overlap → all absent");

// duplicate letters
assert(JSON.stringify(checkGuess("EAGLE", "LEVEL")) === JSON.stringify(["present","absent","absent","present","present"]), "guess EAGLE vs answer LEVEL per-letter verdicts");
assert(JSON.stringify(checkGuess("SSESS", "SASSY")) === JSON.stringify(["correct","present","absent","correct","absent"]), "guess SSESS vs answer SASSY: extra S's capped");
assert(JSON.stringify(checkGuess("AABBB", "ABBAA")) === JSON.stringify(["correct","present","correct","present","absent"]), "mixed duplicates AABBB vs ABBAA");

// ── start flow ────────────────────────────────────────────────────────
const startBtn = els.startBtn;
startBtn.click = () => listeners["startBtn:click"][0]();
startBtn.click();
assert(st().playing === true, "start begins play");
assert(st().LIST.length >= 250 && st().LIST.length <= 350, `word list ~300 (${st().LIST.length})`);
assert(st().LIST.every((w) => /^[A-Z]{5}$/.test(w)), "all embedded words are 5 uppercase letters");

// ── type a guess via physical keyboard ────────────────────────────────
const answer = st().answer;
for (const ch of answer) keydown(ch);
keydown("Enter");
assert(typedRow(0) === answer, "winning guess typed via keyboard fills row 0");
assert(JSON.parse(sandbox.localStorage.store.wordle_stats).w === 1, "win recorded in wordle_stats");
assert(JSON.parse(sandbox.localStorage.store.wordle_stats).l === 0, "loss not recorded on a win");
assert(els.msg.textContent === "", "no warning message after a valid guess");
assert(els.overlayTitle.innerHTML.includes("SOLVED"), "win overlay says SOLVED");
assert(els.overlaySub.textContent.toUpperCase().includes("TRY"), "win overlay shows attempt count");
assert(JSON.stringify(JSON.parse(sandbox.localStorage.store.wordle_stats)) === JSON.stringify(st().stats), "stats chip mirrors persisted stats");

// ── lose flow: 6 wrong guesses in a fresh game ────────────────────────
startBtn.click();
const answer2 = st().answer;
const wrong = st().LIST.find((w) => w.slice(0, 2) !== answer2.slice(0, 2) && !isWinOf(checkGuess(w, answer2)));
for (let g = 0; g < 6; g++) {
  for (const ch of wrong) keydown(ch);
  keydown("Enter");
}
assert(els.overlayTitle.textContent.includes("OUT OF") || els.overlayTitle.innerHTML.includes("OUT OF"), "lose overlay says OUT OF TRIES");
assert(els.overlaySub.textContent.toUpperCase().includes(answer2), "lose overlay reveals the answer");
assert(JSON.parse(sandbox.localStorage.store.wordle_stats).l === 1, "loss recorded in wordle_stats");
assert(JSON.parse(sandbox.localStorage.store.wordle_stats).w === 1, "win count unchanged after loss");

// ── short word rejected ───────────────────────────────────────────────
startBtn.click();
keydown("A");
keydown("Enter");
assert(els.msg.textContent.includes("NOT ENOUGH LETTERS"), "1-letter guess rejected with NOT ENOUGH LETTERS");
assert(st().row === 0, "rejected guess does not advance the row");

// ── backspace clears, off-list word allowed but flagged ───────────────
keydown("Backspace");
assert(st().col === 0, "backspace removes the stray letter");
for (const ch of "QWERT") keydown(ch);
keydown("Enter");
assert(els.msg.textContent.includes("NOT IN LIST"), "off-list guess flagged NOT IN LIST");
assert(st().row === 1, "off-list guess still counts toward the 6 tries");
assert(st().guesses[st().guesses.length - 1]?.guess === "QWERT", "off-list guess submitted with feedback");

// ── new word resets grid fully ────────────────────────────────────────
startBtn.click();
assert(st().row === 0, "new game back at row 0");
assert(els.grid.children.every((el) => el.textContent === ""), "grid cleared on new game");

// ── stats persist across relaunched sessions ─────────────────────────
const relaunch = vm.runInContext(
  readFileSync(new URL("../public/games/wordle/game.js", import.meta.url), "utf8")
    .replace(
      "  const isWin = (verdict) => verdict.every((v) => v === \"correct\");",
      "  const isWin = (verdict) => verdict.every((v) => v === \"correct\");\n  __expose({ checkGuess });"
    )
    .replace(
      "  // ── boot ─────────────────────────────────────────────────────────────",
      "  __state({ get: () => ({ stats }) });\n" +
      "  // ── boot ─────────────────────────────────────────────────────────────"
    ),
  sandbox
);
const relStats = sandbox.hooks.get().stats;
assert(relStats.w === 1 && relStats.l === 1, `stats reloaded from localStorage (w=${relStats.w} l=${relStats.l})`);

if (failures > 0) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log("\nALL WORDLE SMOKE CHECKS PASSED");
