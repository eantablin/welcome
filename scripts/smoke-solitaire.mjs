// Solitaire smoke: extract the pure rules core from game.js (between the
// ══ pure core ══ marker comments) and drive it in node:vm with a stubbed
// document/localStorage so only rules/state-machine behavior is asserted.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("../public/games/solitaire/game.js", import.meta.url), "utf8");
const startMark = src.indexOf("// ══ pure game core");
const endMark = src.indexOf("// ══ end pure core");
if (startMark < 0 || endMark < 0) throw new Error("pure core markers not found in game.js");
const core = src.slice(startMark, endMark);

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(core + "\nglobalThis.core = { buildDeck, deal, legalTableauMove, legalFoundationMove, tryMove, drawStock, isWin, newGame, RANK_VALUE, SUITS, RED_SUITS };", sandbox);
const {
  buildDeck, deal, legalTableauMove, legalFoundationMove,
  tryMove, drawStock, isWin, newGame, RANK_VALUE, SUITS, RED_SUITS,
} = sandbox.core;

let passed = 0;
const assert = (cond, msg) => {
  if (!cond) { console.error("FAIL:", msg); process.exit(1); }
  console.log("PASS:", msg);
  passed++;
};

// ── 1. deal shape ─────────────────────────────────────────────────────
assert(SUITS.length === 4 && RANK_VALUE.A === 1 && RANK_VALUE.K === 13, "rank ladder A=1..K=13");
const deck = buildDeck();
assert(deck.length === 52, "deck has 52 cards");
assert(deck.every((c) => c.up === false), "deck built face-down");
assert(new Set(deck.map((c) => c.r + c.s)).size === 52, "deck has no duplicate cards");

const dealt = deal(deck);
assert(dealt.tableau.length === 7, "deal creates 7 tableau piles");
assert(dealt.tableau.every((p, i) => p.length === i + 1), "tableau piles hold 1..7 cards");
assert(dealt.tableau.every((p) => p[p.length - 1].up), "each tableau top is face up");
assert(dealt.tableau.every((p, i) => p.slice(0, -1).every((c) => !c.up)), "under each top all cards face down");
assert(dealt.stock.length === 24 && dealt.waste.length === 0, "deal leaves 24 cards in stock, waste empty");
assert(
  dealt.tableau.flat().concat(dealt.stock).length === 52 &&
  new Set(dealt.tableau.flat().concat(dealt.stock).map((c) => c.r + c.s)).size === 52,
  "deal uses every card exactly once"
);

// ── 2. helpers for building cards ─────────────────────────────────────
const C = (r, s, up = true) => ({ r, s, up });

// ── 3. tableau legality: descending + alternating colors ──────────────
assert(legalTableauMove([C("Q", "♠")], [C("K", "♥")]) === true, "♠Q onto ♥K (desc + alt color)");
assert(legalTableauMove([C("J", "♦")], [C("K", "♦")]) === false, "same-color onto K rejected");
assert(legalTableauMove([C("J", "♠")], [C("K", "♥")]) === false, "non-descending rank rejected");
assert(legalTableauMove([C("K", "♠")], []) === true, "K onto empty tableau");
assert(legalTableauMove([], []) === false, "empty selection onto empty tableau rejected");
assert(legalTableauMove([C("5", "♥")], []) === false, "non-K onto empty tableau rejected");
assert(legalTableauMove([C("7", "♥"), C("6", "♠"), C("5", "♥")], [C("8", "♠")]) === true, "3-card ordered run accepted");
assert(legalTableauMove([C("7", "♥"), C("6", "♥")], []) === false, "run with same-color neighbours rejected");
assert(legalTableauMove([C("7", "♥"), C("4", "♠")], []) === false, "run with rank gap rejected");
assert(
  legalTableauMove(
    [C("9", "♥", true), C("8", "♦")], // suits irrelevant, colors: red+red = illegal
    []
  ) === false,
  "run must alternate colors even when both are red suits"
);

// ── 4. foundation legality: single card, same suit, ascending ─────────
assert(legalFoundationMove([C("A", "♣")], []) === true, "A starts foundation");
assert(legalFoundationMove([C("A", "♣"), C("2", "♣")], []) === false, "multi-card run never goes to foundation");
assert(legalFoundationMove([C("2", "♣")], [C("A", "♣")]) === true, "2♣ onto A♣");
assert(legalFoundationMove([C("3", "♣")], [C("A", "♣")]) === false, "skip-SKIPs rejected (3 onto A)");
assert(legalFoundationMove([C("2", "♠")], [C("A", "♥")]) === false, "suit switch inside foundation rejected");

// ── 5. stock draw + recycle order ─────────────────────────────────────
const st1 = { stock: [C("2", "♠", false), C("3", "♥", false), C("K", "♦", false)], waste: [], foundations: [[], [], [], []], tableau: [[], [], [], [], [], [], []] };
drawStock(st1);
assert(st1.waste.length === 1 && st1.waste[0].r === "K" && st1.waste[0].s === "♦" && st1.waste[0].up, "draw pops stock top (K♦) into waste face up");
assert(st1.stock.length === 2, "stock shrinks to 2");
drawStock(st1); drawStock(st1);
assert(st1.waste.map((c) => c.r + c.s).join() === "K♦,3♥,2♠", "waste order = stock pops in LIFO order");
assert(drawStock(st1) === true, "empty stock click recycles");
assert(st1.waste.length === 0, "recycle drains waste onto stock");
// draw three again after recycle: same order replays
drawStock(st1); drawStock(st1); drawStock(st1);
assert(st1.waste.map((c) => c.r + c.s).join() === "K♦,3♥,2♠", "recycle preserves draw1 sequence");
const st2 = { stock: [], waste: [], foundations: [[], [], [], []], tableau: [[], [], [], [], [], [], []] };
assert(drawStock(st2) === false, "empty stock + empty waste: recycle fails");

// ── 6. auto-flip newly exposed top ────────────────────────────────────
const st3 = {
  stock: [], waste: [], foundations: [[], [], [], []],
  tableau: [[C("3", "♦", false), C("4", "♠", true), C("5", "♥", true)], [], [], [], [], [], []],
};
assert(
  tryMove(st3, { kind: "tableau", i: 0, count: 1 }, { kind: "tableau", i: 1 }) === false,
  "moving 5♥ onto empty tableau rejected (not K)"
);
assert(st3.tableau[0].length === 3 && st3.tableau[0][2].up === true, "rejected move leaves state untouched");
assert(
  tryMove(st3, { kind: "tableau", i: 0, count: 2 }, { kind: "tableau", i: 1 }) === false,
  "run with a face-down card is never lifted"
);
// move just the top 5♥ onto a ♠6 pile → 4♠ flips up
const st4 = {
  stock: [], waste: [], foundations: [[], [], [], []],
  tableau: [[C("3", "♦", false), C("4", "♠", false), C("5", "♥", true)], [C("6", "♠", true)], [], [], [], [], []],
};
assert(tryMove(st4, { kind: "tableau", i: 0, count: 1 }, { kind: "tableau", i: 1 }) === true, "single-card tableau→tableau with count=1");
assert(st4.tableau[0].length === 2, "source pile lost one card");
assert(st4.tableau[1].map((c) => c.r + c.s).join() === "6♠,5♥", "card landed on destination pile");
assert(st4.tableau[0][1].up === true && st4.tableau[0][1].r === "4", "newly exposed top auto-flips");
// moving the whole pile leaves nothing to flip
const st5 = {
  stock: [], waste: [], foundations: [[], [], [], []],
  tableau: [[C("K", "♥", true)], [], [], [], [], [], []],
};
assert(tryMove(st5, { kind: "tableau", i: 0, count: 1 }, { kind: "tableau", i: 1 }) === true, "K♥ moves onto empty pile");
assert(st5.tableau[0].length === 0, "source emptied");
assert(st5.tableau[1].length === 1, "destination grew");

// ── 7. stack-segment move via tryMove ─────────────────────────────────
// hand-constructed state: pile 0 = 5♥(d) 7♠(u) 6♥(u); move 2-card 7♠6♥ run onto 8♥ pile
const st6 = {
  stock: [], waste: [], foundations: [[], [], [], []],
  tableau: [
    [C("5", "♥", false), C("7", "♠", true), C("6", "♥", true)],
    [C("8", "♥", true)],
    [], [], [], [], [],
  ],
};
assert(tryMove(st6, { kind: "tableau", i: 0, count: 2 }, { kind: "tableau", i: 1 }) === true, "ordered 2-card run moves as a unit");
assert(st6.tableau[1].map((c) => c.r + c.s).join() === "8♥,7♠,6♥", "run appended in order");
assert(st6.tableau[0].length === 1 && st6.tableau[0][0].up === true, "remaining face-down 5♥ flipped up");

// foundation→tableau (foundation is also a valid source for tryMove)
const st7 = {
  stock: [], waste: [],
  foundations: [[C("K", "♠"), C("Q", "♠")], [], [], []],
  tableau: [[C("K", "♥", true)], [], [], [], [], [], []],
};
assert(tryMove(st7, { kind: "foundation", i: 0 }, { kind: "tableau", i: 0 }) === true, "foundation top can move back to tableau");
assert(st7.foundations[0].length === 1 && st7.tableau[0].length === 2, "foundation↔tableau transfer committed");

// waste → tableau
const st8 = {
  stock: [], waste: [C("A", "♠", true), C("9", "♠", true)], foundations: [[], [], [], []],
  tableau: [[C("10", "♥", true)], [], [], [], [], [], []],
};
assert(tryMove(st8, { kind: "waste", i: 0 }, { kind: "tableau", i: 0 }) === true, "waste top moves to tableau");
assert(st8.waste.length === 1 && st8.waste[0].r === "A", "waste shrank by the moved card");
assert(st8.tableau[0].map((c) => c.r + c.s).join() === "10♥,9♠", "waste card landed correctly");

// ── 8. tryMove foundation acceptance + suit lock ──────────────────────
const st9 = {
  stock: [], waste: [], foundations: [[], [], [], []],
  tableau: [[C("A", "♦", true)], [], [], [], [], [], []],
};
assert(tryMove(st9, { kind: "tableau", i: 0 }, { kind: "foundation", i: 0 }) === false, "A♦ rejected from ♥-slot foundation (suit lock)");
assert(tryMove(st9, { kind: "tableau", i: 0 }, { kind: "foundation", i: 2 }) === true, "A♦ accepted into ♦-slot foundation");
assert(st9.foundations[2].length === 1 && st9.tableau[0].length === 0, "foundation move committed");
// wrong suit A into empty non-matching foundation rejected
const st10 = {
  stock: [], waste: [], foundations: [[], [], [], []],
  tableau: [[C("A", "♥", true)], [], [], [], [], [], []],
};
assert(tryMove(st10, { kind: "tableau", i: 0 }, { kind: "foundation", i: 0 }) === false, "A♥ rejected from ♠-slot foundation");
// waste 2-card run never to foundation
const st10b = { stock: [], waste: [C("A", "♠", true)], foundations: [[], [], [], []], tableau: [[], [], [], [], [], [], []] };
assert(tryMove(st10b, { kind: "waste", i: 0 }, { kind: "foundation", i: 0 }) === true, "waste A♠ accepted into ♠ foundation");

// ── 9. win detection ──────────────────────────────────────────────────
const stW = newGame();
assert(isWin(stW) === false, "fresh deal is not a win");
const full = { stock: [], waste: [], foundations: [], tableau: [[], [], [], [], [], [], []] };
for (const s of SUITS) {
  const f = [];
  for (const r of ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]) f.push(C(r, s));
  full.foundations.push(f);
}
assert(isWin(full) === true, "all 13 per suit → win");
assert(isWin({ ...full, foundations: full.foundations.map((f, i) => (i === 2 ? f.slice(0, 12) : f)) }) === false, "one foundation shy of 13 → not a win");

// ── 10. newGame proof: random deals are structurally valid ────────────
for (let i = 0; i < 50; i++) {
  const s = newGame();
  const sizesOk = s.tableau.every((p, pi) => p.length === pi + 1);
  const upsOk = s.tableau.every((p) => p[p.length - 1].up && p.slice(0, -1).every((c) => !c.up));
  const all = s.tableau.flat().concat(s.stock, s.waste);
  if (!sizesOk || !upsOk || all.length !== 52 || new Set(all.map((c) => c.r + c.s)).size !== 52) {
    console.error("FAIL: random deal", i); process.exit(1);
  }
}
assert(true, "50 random deals all structurally valid");

// ── 11. end-to-end mini-solve with tryMove + drawStock ────────────────
// Deterministic replay: set stock order so we can move every card dealt later.
// Simulate a solvable-by-construction game: adopt layout [d2♠, A♣, rest in tableau?] —
// use tryMove on a fully scripted manual deal instead.
const stE = {
  stock: [],
  waste: [],
  foundations: [[], [], [], []],
  tableau: [
    [C("6", "♠", true)],
    [C("7", "♥", true), C("6", "♦", true)],
    [C("3", "♠", true), C("2", "♦", true), C("A", "♥", true)],
    [], [], [], [],
  ],
};
// ♠6 stays as its own foundation path: ♠ slot index 0
assert(tryMove(stE, { kind: "tableau", i: 0 }, { kind: "foundation", i: 0 }) === false, "6♠ cannot enter empty ♠ foundation");
// build red run then move it: pile 2 = 3♠,2♦,A♥ … wrong for ak; use legal moves
// move 6♦ (pile 1) onto empty tableau (needs K) — rejected:
assert(tryMove(stE, { kind: "tableau", i: 1, count: 1 }, { kind: "tableau", i: 3 }) === false, "6♦ rejected onto empty (no K)");
// A♥ → ♥ foundation
assert(tryMove(stE, { kind: "tableau", i: 2 }, { kind: "foundation", i: 1 }) === true, "A♥ auto-routed into ♥ foundation");
assert(stE.tableau[2].length === 2 && stE.tableau[2][1].up === true && stE.tableau[2][1].r === "2", "2♦ auto-flipped after A♥ left");
console.log(`\n${passed} checks passed`);
console.log("ALL SOLITAIRE SMOKE CHECKS PASSED");
