// =====================================================================
// SOLITAIRE — brutalist Klondike solitaire.
// Click-to-move: tap a source card, then a destination. No drag.
// Standard Klondike: 7 tableau piles (1..7 cards, top face up), 4
// suit-locked foundations, stock draw-1 with unlimited recycle,
// tableau builds down alternating colors, only K onto empty tableau,
// ordered face-up stack segments move as a unit, auto-flip newly
// exposed tops. Win: all 52 cards on foundations → MOVES/TIME overlay.
// Best (fewest moves win) persisted. WebAudio synth SFX.
// =====================================================================

(() => {
  "use strict";

  // ── theme (respects site-wide dark mode) ─────────────────────────────
  const root = document.documentElement;
  root.dataset.theme =
    localStorage.getItem("theme") ??
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

  // ── audio (synth only, gated behind user gesture) ─────────────────────
  let audioCtx = null;
  let soundOn = false;

  const beep = (freq, dur = 0.08, type = "square", gain = 0.08) => {
    if (!soundOn || !audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur);
  };

  const moveSfx = () => beep(520, 0.05, "square", 0.05);
  const foundationSfx = () => { beep(660, 0.08); setTimeout(() => beep(990, 0.12), 90); };
  const badSfx = () => beep(140, 0.12, "sawtooth", 0.08);
  const winSfx = () => { beep(660, 0.08); setTimeout(() => beep(990, 0.12), 90); setTimeout(() => beep(1320, 0.16), 210); };

  const unlockAudio = () => {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ }
    }
    audioCtx?.resume?.();
  };

  // ══ pure game core (testable without DOM — smoke-extracted) ══════════
  const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const RANK_VALUE = { A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13 };
  const RED_SUITS = { "♥": true, "♦": true };
  const SUITS = ["♠", "♥", "♦", "♣"];

  const isRed = (card) => !!RED_SUITS[card.s];
  const rv = (card) => RANK_VALUE[card.r];

  const shuffle = (deck) => {
    const a = deck.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  function buildDeck() {
    const cards = [];
    for (const s of SUITS) for (const r of RANKS) cards.push({ r, s, up: false });
    return cards;
  }

  // deal 7 tableau piles with 1..7 cards, top of each face up
  function deal(deck) {
    const stock = deck.slice();
    const tableau = [];
    for (let i = 0; i < 7; i++) {
      const pile = [];
      for (let k = 0; k < i + 1; k++) pile.push({ ...stock.pop(), up: k === i });
      tableau.push(pile);
    }
    return { tableau, stock, waste: [], foundations: [[], [], [], []] };
  }

  // `cards` = ordered segment (cards[0] is the bottom of the moving run).
  // Legal onto `pile`: descending ranks, alternating colors throughout the
  // run AND against the pile top; onto an empty pile only a K-starting run.
  const legalTableauMove = (cards, pile) => {
    if (!cards || cards.length === 0) return false;
    for (let i = 0; i < cards.length - 1; i++) {
      if (rv(cards[i]) !== rv(cards[i + 1]) + 1) return false;
      if (isRed(cards[i]) === isRed(cards[i + 1])) return false;
    }
    if (pile.length === 0) return rv(cards[0]) === RANK_VALUE.K;
    const top = pile[pile.length - 1];
    return rv(top) === rv(cards[0]) + 1 && isRed(top) !== isRed(cards[0]);
  };

  // foundation: single card only, same suit ascending, A starts on empty
  const legalFoundationMove = (cards, foundation) => {
    if (!cards || cards.length !== 1) return false;
    const card = cards[0];
    if (foundation.length === 0) return card.r === "A";
    const top = foundation[foundation.length - 1];
    return top.s === card.s && rv(card) === rv(top) + 1;
  };

  // from: {kind:"tableau"|"waste"|"foundation", i, count?}
  //   tableau: count = face-up segment taken from the top (default 1)
  // to:   {kind:"tableau"|"foundation", i}
  // Mutates `state` on success; returns false with state untouched on any
  // illegal move.
  function tryMove(state, from, to) {
    let cards;
    if (from.kind === "tableau") {
      const pile = state.tableau[from.i];
      if (!pile) return false;
      const count = Math.min(from.count ?? 1, pile.length);
      cards = pile.slice(pile.length - count);
      if (!cards.every((c) => c.up)) return false; // never lift a face-down card
    } else if (from.kind === "waste") {
      if (state.waste.length === 0) return false;
      cards = [state.waste[state.waste.length - 1]];
    } else if (from.kind === "foundation") {
      const f = state.foundations[from.i];
      if (!f || f.length === 0) return false;
      cards = [f[f.length - 1]];
    } else {
      return false;
    }

    let ok;
    if (to.kind === "tableau") {
      ok = !!state.tableau[to.i] && legalTableauMove(cards, state.tableau[to.i]);
    } else if (to.kind === "foundation") {
      ok = cards.length === 1 &&
        legalFoundationMove(cards, state.foundations[to.i]) &&
        cards[0].s === SUITS[to.i]; // slots are suit-locked
    } else {
      ok = false;
    }
    if (!ok) return false;

    // commit
    if (from.kind === "tableau") state.tableau[from.i].length -= cards.length;
    else if (from.kind === "waste") state.waste.pop();
    else state.foundations[from.i].pop();

    if (to.kind === "tableau") state.tableau[to.i].push(...cards);
    else state.foundations[to.i].push(cards[0]);

    // auto-flip the newly exposed tableau top
    if (from.kind === "tableau") {
      const src = state.tableau[from.i];
      if (src.length > 0 && !src[src.length - 1].up) src[src.length - 1].up = true;
    }
    return true;
  }

  // stock draw-1; empty stock + waste → recycle (waste back to stock,
  // order preserved so each recycle cycle replays the same sequence)
  function drawStock(state) {
    if (state.stock.length === 0) {
      if (state.waste.length === 0) return false;
      state.stock = state.waste.splice(0).reverse();
      return true;
    }
    const c = state.stock.pop();
    c.up = true;
    state.waste.push(c);
    return true;
  }

  const isWin = (state) => state.foundations.every((f) => f.length === 13);

  function newGame() {
    return deal(shuffle(buildDeck()));
  }
  // ══ end pure core ════════════════════════════════════════════════════

  // ── DOM wiring ───────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const els = {
    moves: $("moves"), timer: $("timer"),
    stock: $("stock"), waste: $("waste"),
    tableau: $("tableau"),
    overlay: $("overlay"), overlayScore: $("overlayScore"),
    startBtn: $("startBtn"), soundBtn: $("soundBtn"),
  };
  const foundSlots = [0, 1, 2, 3].map((i) =>
    document.querySelector(`.pile__slot--foundation[data-fi="${i}"]`)
  );

  let state, moves, elapsed, timerId, sel;
  let best = Number(localStorage.getItem("solitaire_best") ?? 0) || 0;

  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const syncHud = () => {
    els.moves.textContent = `MOVES ${moves}`;
    els.timer.textContent = `TIME ${fmtTime(elapsed)}`;
  };

  // ── rendering (compact DOM cards, blackjack visual language) ─────────
  const faceHtml = (c, attrs = "") =>
    `<button type="button" class="card${attrs}" aria-label="${c.r}${c.s}">` +
    `<span class="card__corner">${c.r}${c.s}</span>` +
    `<span class="card__corner card__corner--right">${c.r}${c.s}</span></button>`;

  const renderFound = (i) => {
    const f = state.foundations[i];
    const slot = foundSlots[i];
    slot.innerHTML = f.length ? faceHtml(f[f.length - 1]) : "";
    slot.classList.toggle("pile__slot--empty", !f.length);
  };

  const render = () => {
    els.stock.innerHTML = state.stock.length
      ? `<button type="button" class="card card--down" aria-label="DRAW"></button>`
      : "";
    els.stock.classList.toggle("pile__slot--empty", !state.stock.length);

    els.waste.innerHTML = state.waste.length ? faceHtml(state.waste[state.waste.length - 1]) : "";
    els.waste.classList.toggle("pile__slot--empty", !state.waste.length);

    for (let i = 0; i < 4; i++) renderFound(i);

    els.tableau.innerHTML = state.tableau.map((pile, pi) => {
      const cards = pile.map((c, ci) => {
        if (!c.up) return `<div class="card card--down"></div>`;
        const isSel = sel && sel.kind === "tableau" && sel.i === pi &&
          ci >= pile.length - sel.count;
        return `<button type="button" class="card${isSel ? " card--sel" : ""}" data-pile="${pi}" data-ci="${ci}" aria-label="${c.r}${c.s}">` +
          `<span class="card__corner">${c.r}${c.s}</span>` +
          `<span class="card__corner card__corner--right">${c.r}${c.s}</span></button>`;
      }).join("");
      return `<div class="pile"><div class="pile__slot pile__slot--t" data-tdrop="${pi}">${cards}</div></div>`;
    }).join("");

    syncHud();
  };

  // ── timer ────────────────────────────────────────────────────────────
  const startTimer = () => {
    const t0 = Date.now();
    timerId = setInterval(() => {
      elapsed = Math.floor((Date.now() - t0) / 1000);
      els.timer.textContent = `TIME ${fmtTime(elapsed)}`;
    }, 1000);
  };
  const stopTimer = () => { if (timerId) { clearInterval(timerId); timerId = null; } };

  // ── flow ─────────────────────────────────────────────────────────────
  const finish = () => {
    stopTimer();
    if (best === 0 || moves < best) {
      best = moves;
      localStorage.setItem("solitaire_best", String(best));
      els.overlayScore.innerHTML = `NEW BEST — ${moves} MOVES — ${fmtTime(elapsed)}`;
    } else {
      els.overlayScore.innerHTML = `${moves} MOVES — ${fmtTime(elapsed)} — BEST ${best}`;
    }
    els.overlayScore.hidden = false;
    els.overlay.hidden = false;
    els.startBtn.textContent = "PLAY AGAIN";
    els.startBtn.focus?.();
    winSfx();
  };

  const act = (from, to) => {
    if (tryMove(state, from, to)) {
      moves++;
      moveSfx();
      if (to.kind === "foundation") foundationSfx();
      if (isWin(state)) setTimeout(finish, 0);
    } else {
      badSfx();
    }
    sel = null;
    render();
  };

  const onStock = () => {
    unlockAudio();
    if (drawStock(state)) moveSfx();
    sel = null;
    render();
  };

  els.stock.addEventListener("click", onStock);

  // waste: top card is the source; clicking it again deselects
  els.waste.addEventListener("click", () => {
    unlockAudio();
    if (sel && sel.kind === "waste") { sel = null; render(); return; }
    if (!sel && state.waste.length) {
      sel = { kind: "waste" };
      moveSfx();
      render();
    }
  });

  // foundation slots: accept a selected single card, or select their top
  foundSlots.forEach((slot, fi) => {
    slot.addEventListener("click", () => {
      unlockAudio();
      if (sel) { act(sel, { kind: "foundation", i: fi }); return; }
      if (state.foundations[fi].length) { sel = { kind: "foundation", i: fi }; render(); }
    });
  });

  // tableau: delegate clicks on cards and empty drop slots
  els.tableau.addEventListener("click", (e) => {
    unlockAudio();
    const btn = e.target.closest("button[data-pile]");
    if (btn) {
      const pi = Number(btn.dataset.pile);
      const ci = Number(btn.dataset.ci);
      if (sel) {
        // same-pile click toggles the selection off
        if (sel.kind === "tableau" && sel.i === pi) { sel = null; render(); return; }
        act(sel, { kind: "tableau", i: pi }); // destination attempt
        return;
      }
      const pile = state.tableau[pi];
      if (pile[ci]?.up) {
        sel = { kind: "tableau", i: pi, count: pile.length - ci };
        moveSfx();
        render();
      }
      return;
    }
    const drop = e.target.closest("[data-tdrop]");
    if (drop && sel) act(sel, { kind: "tableau", i: Number(drop.dataset.tdrop) });
  });

  // ── keyboard ─────────────────────────────────────────────────────────
  document.addEventListener("keydown", (ev) => {
    if (!els.overlay.hidden) {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); start(); }
      return;
    }
    if (ev.key === "Escape") { sel = null; render(); return; }
    if (ev.key === "d" || ev.key === "D") { unlockAudio(); onStock(); return; }
    if ((ev.key === "Enter" || ev.key === " ") && document.activeElement === els.stock) {
      ev.preventDefault();
      onStock();
    }
  });

  // ── sound toggle ─────────────────────────────────────────────────────
  els.soundBtn.addEventListener("click", (e) => {
    soundOn = !soundOn;
    e.currentTarget.setAttribute("aria-pressed", String(soundOn));
    e.currentTarget.textContent = "SOUND: " + (soundOn ? "ON" : "OFF");
    unlockAudio();
  });

  // ── game lifecycle ───────────────────────────────────────────────────
  const start = () => {
    unlockAudio();
    state = newGame();
    moves = 0;
    elapsed = 0;
    sel = null;
    els.overlay.hidden = true;
    els.overlayScore.hidden = true;
    els.startBtn.textContent = "PRESS START";
    stopTimer();
    startTimer();
    render();
  };

  els.startBtn.addEventListener("click", start);
  // tap anywhere on the instructions panel = start (touch-first)
  document.querySelector(".overlay__panel")?.addEventListener("click", (e) => {
    if (e.target !== els.startBtn) start();
  });

  // ── boot ─────────────────────────────────────────────────────────────
  // state is dealt behind the overlay so the table is ready to play
  state = newGame();
  moves = 0;
  elapsed = 0;
  sel = null;
  render();

  function registerSW() {
    if ("serviceWorker" in navigator && location.protocol === "https:") {
      navigator.serviceWorker.register("sw.js").catch(() => { /* offline cache unavailable */ });
    }
  }
  registerSW();
})();
