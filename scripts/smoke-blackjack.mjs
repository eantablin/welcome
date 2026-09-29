// Throwaway-turned-permanent smoke: run blackjack game.js against a stubbed DOM.
// Proves: deal, hit, bust, stand → dealer draw to 17, settle math, bankroll persistence.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const code = readFileSync(new URL("../public/blackjack/game.js", import.meta.url), "utf8")
  // expose internals for the harness only (shipped file is untouched)
  .replace(
    /player = \{ cards: \[\] \};\n  dealer = \{ cards: \[\] \};\n  shoe = buildShoe\(\);/,
    "__state({ get: () => ({ player, dealer, shoe, bankroll, bet, phase }), set: (o) => ({ player, dealer, shoe, bankroll, bet } = { ...{ player, dealer, shoe, bankroll, bet }, ...o }) });\n  " +
    "player = { cards: [] };\n  dealer = { cards: [] };\n  shoe = buildShoe();"
  );

const els = {};
const listeners = {};
const makeEl = (id) => ({
  id, textContent: "", innerHTML: "", hidden: false, disabled: false,
  style: {}, currentTarget: null,
  addEventListener: (ev, fn) => { (listeners[id + ":" + ev] ??= []).push(fn); },
  setAttribute: () => {},
});
for (const id of ["bankroll", "msg", "dealerCards", "playerCards", "dealerTotal", "playerTotal", "betControls", "playControls", "betMinus", "betPlus", "betAmount", "dealBtn", "hitBtn", "standBtn", "doubleBtn", "soundBtn", "installHint"]) {
  els[id] = makeEl(id);
}
// event wiring: element listeners delegate to our captured handlers
els.dealBtn.click = () => listeners["dealBtn:click"][0]({ currentTarget: els.dealBtn });
els.hitBtn.click = () => listeners["hitBtn:click"][0]({ currentTarget: els.hitBtn });
els.standBtn.click = () => listeners["standBtn:click"][0]({ currentTarget: els.standBtn });
els.doubleBtn.click = () => listeners["doubleBtn:click"][0]({ currentTarget: els.doubleBtn });

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
  setTimeout: (fn) => fn(),
  requestAnimationFrame: () => 0,
  __state: (hooks) => { sandbox.hooks = hooks; },
  registerSW: () => {},
};

vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const st = () => sandbox.hooks.get();
const assert = (cond, msg) => { if (!cond) { console.error("FAIL:", msg, "| state:", JSON.stringify({ bankroll: st().bankroll, bet: st().bet, msg: els.msg.textContent })); process.exit(1); } console.log("PASS:", msg); };

// boot: bet phase, $100
assert(st().bankroll === 100 && st().phase === undefined, "boots at $100");
assert(els.bankroll.textContent === "$100", "HUD shows $100");
assert(st().shoe.length === 312, "6-deck shoe built (312 cards)");

// deterministic deal: force known shoe order via set()
// deal order = player, player, dealer, dealer
// player: K♥ + A♠ → blackjack (21); dealer: 10♦ + 8♣ → 18
sandbox.hooks.set({
  shoe: [{ r: "K", s: "♥" }, { r: "A", s: "♠" }, { r: "10", s: "♦" }, { r: "8", s: "♣" }, ...st().shoe.slice(0, 300) ].reverse(),
});
els.dealBtn.click();
assert(els.msg.textContent.includes("BLACKJACK"), "natural blackjack detected");
assert(els.msg.textContent.includes("$15"), "blackjack pays 3:2 (+$15)");
assert(st().bankroll === 115, "bankroll 100 → 115");
assert(sandbox.localStorage.store.brutal21_bankroll === "115", "bankroll persisted");

// dealer natural against player 19 → lose
// player 9♠ + Q♣ = 19; dealer A♥ + K♦ = 21
sandbox.hooks.set({ bet: 10 });
sandbox.hooks.set({
  shoe: [{ r: "9", s: "♠" }, { r: "Q", s: "♣" }, { r: "A", s: "♥" }, { r: "K", s: "♦" }, ...st().shoe.slice(0, 300) ].reverse(),
});
els.dealBtn.click();
assert(els.msg.textContent.includes("DEALER BLACKJACK"), "dealer natural detected");
assert(st().bankroll === 105, "bankroll 115 → 105");

// plain hand: hit to bust
sandbox.hooks.set({
  shoe: [{ r: "K", s: "♥" }, { r: "8", s: "♣" }, { r: "10", s: "♠" }, { r: "10", s: "♦" }, { r: "10", s: "♣" }, { r: "9", s: "♥" }, ...st().shoe.slice(0, 300) ].reverse(),
});
els.dealBtn.click();
assert(els.msg.textContent === "HIT OR STAND", "play phase entered");
els.hitBtn.click(); // 20 → 30 bust
assert(els.msg.textContent.includes("BUST"), "hit to 30 busts");
assert(st().bankroll === 95, "bankroll 105 → 95");

// stand: dealer draws to 17+ and player wins when dealer busts
// player: 10+10=20 stands; dealer: 6+7=13 then draws 10 (23) → dealer bust
sandbox.hooks.set({
  shoe: [{ r: "10", s: "♣" }, { r: "10", s: "♥" }, { r: "7", s: "♦" }, { r: "6", s: "♠" }, { r: "10", s: "♥" }, ...st().shoe.slice(0, 300) ].reverse(),
});
els.dealBtn.click();
els.standBtn.click();
assert(els.msg.textContent.includes("DEALER BUSTS"), "dealer busts when forced past 17");
assert(st().bankroll === 105, "bankroll 95 → 105");

// double: player 6+5=11 → double → K♣ = 21; dealer 17 stands → YOU WIN
sandbox.hooks.set({ bet: 10 });
sandbox.hooks.set({
  shoe: [{ r: "6", s: "♣" }, { r: "5", s: "♥" }, { r: "8", s: "♦" }, { r: "9", s: "♠" }, { r: "K", s: "♣" }, { r: "9", s: "♥" }, ...st().shoe.slice(0, 300) ].reverse(),
});
els.dealBtn.click();
els.doubleBtn.click();
assert(els.msg.textContent.includes("YOU WIN"), "doubled 11→21 beats dealer 17");

// bust empty bankroll resets to $100
sandbox.hooks.set({ bankroll: 5, bet: 5 });
sandbox.hooks.set({
  shoe: [{ r: "K", s: "♥" }, { r: "8", s: "♣" }, { r: "10", s: "♠" }, { r: "10", s: "♦" }, { r: "9", s: "♣" }, { r: "9", s: "♥" }, ...st().shoe.slice(0, 300) ].reverse(),
});
els.dealBtn.click();
els.hitBtn.click();
assert(st().bankroll === 100, "empty bankroll resets to $100");
assert(sandbox.localStorage.store.brutal21_bankroll === "100", "reset persisted");

console.log("\nALL BLACKJACK SMOKE CHECKS PASSED");
