// =====================================================================
// BRUTAL 21 — brutalist blackjack.
// Rules: 6-deck shoe (reshuffled below 20 cards), dealer stands on soft 17,
// blackjack pays 3:2, double allowed on first two cards, no split/surrender.
// Bankroll + bet persisted in localStorage. WebAudio synth SFX.
// =====================================================================

(() => {
  "use strict";

  // ── theme (respects site-wide dark mode) ─────────────────────────────
  const root = document.documentElement;
  root.dataset.theme =
    localStorage.getItem("theme") ??
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

  // ── audio ────────────────────────────────────────────────────────────
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

  const dealSfx = () => beep(520, 0.05, "square", 0.05);
  const winSfx = () => { beep(660, 0.08); setTimeout(() => beep(990, 0.12), 90); };
  const loseSfx = () => beep(140, 0.25, "sawtooth", 0.1);
  const pushSfx = () => beep(440, 0.1, "triangle", 0.06);

  const unlockAudio = () => {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ }
    }
    audioCtx?.resume?.();
  };

  // ── DOM ──────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const els = {
    bankroll: $("bankroll"), msg: $("msg"),
    dealerCards: $("dealerCards"), playerCards: $("playerCards"),
    dealerTotal: $("dealerTotal"), playerTotal: $("playerTotal"),
    betControls: $("betControls"), playControls: $("playControls"),
    betMinus: $("betMinus"), betPlus: $("betPlus"), betAmount: $("betAmount"),
    dealBtn: $("dealBtn"), hitBtn: $("hitBtn"), standBtn: $("standBtn"), doubleBtn: $("doubleBtn"),
    installHint: $("installHint"),
  };

  // ── state ────────────────────────────────────────────────────────────
  let bankroll = Number(localStorage.getItem("brutal21_bankroll") ?? 100);
  let bet = 10;
  let shoe = [];
  let player, dealer, phase; // phase: "bet" | "play" | "settle"

  const betMax = () => bankroll;
  const fmt = (n) => `$${n}`;

  const syncHud = () => {
    els.bankroll.textContent = fmt(bankroll);
    els.betAmount.textContent = fmt(bet);
    els.betMinus.disabled = bet <= 5;
    els.betPlus.disabled = bet >= betMax();
    els.dealBtn.disabled = bet > bankroll || bankroll <= 0;
  };

  const buildShoe = () => {
    const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
    const suits = ["♠", "♥", "♦", "♣"];
    const cards = [];
    for (let d = 0; d < 6; d++)
      for (const s of suits) for (const r of ranks) cards.push({ r, s });
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  };

  const draw = () => {
    if (shoe.length < 20) shoe = buildShoe();
    return shoe.pop();
  };

  const handValue = (cards) => {
    let total = 0, aces = 0;
    for (const c of cards) {
      if (c.r === "A") { total += 11; aces++; }
      else if (["J", "Q", "K"].includes(c.r)) total += 10;
      else total += Number(c.r);
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    const soft = aces > 0; // an ace still counted as 11
    return { total, soft };
  };

  const isBlackjack = (cards) =>
    cards.length === 2 && handValue(cards).total === 21;

  // ── rendering ────────────────────────────────────────────────────────
  const cardHtml = (c, down) => {
    if (down) return `<div class="card card--down"></div>`;
    return `<div class="card">
      <span class="card__corner">${c.r}${c.s}</span>${c.r}${c.s}
      <span class="card__corner card__corner--right">${c.r}${c.s}</span>
    </div>`;
  };

  const render = ({ hideDealerHole = false } = {}) => {
    const hideIndex = hideDealerHole ? 1 : -1;
    els.dealerCards.innerHTML =
      dealer.cards.map((c, i) => cardHtml(c, i === hideIndex)).join("");
    els.playerCards.innerHTML = player.cards.map((c) => cardHtml(c)).join("");

    if (hideDealerHole) {
      const visible = dealer.cards.filter((_, i) => i !== hideIndex);
      els.dealerTotal.textContent = handValue(visible).total;
      els.dealerTotal.hidden = false;
    } else {
      els.dealerTotal.textContent = handValue(dealer.cards).total;
      els.dealerTotal.hidden = dealer.cards.length === 0;
    }
    els.playerTotal.textContent = handValue(player.cards).total;
    els.playerTotal.hidden = player.cards.length === 0;
  };

  const showBet = () => {
    phase = "bet";
    els.betControls.hidden = false;
    els.playControls.hidden = true;
    syncHud();
  };

  const showPlay = (canDouble) => {
    phase = "play";
    els.betControls.hidden = true;
    els.playControls.hidden = false;
    els.doubleBtn.hidden = !canDouble;
  };

  // ── flow ─────────────────────────────────────────────────────────────
  const deal = () => {
    unlockAudio();
    if (bet > bankroll) return;
    player = { cards: [] };
    dealer = { cards: [] };
    player.cards.push(draw(), draw());
    dealer.cards.push(draw(), draw());
    dealSfx();

    if (isBlackjack(player.cards) || isBlackjack(dealer.cards)) {
      render();
      settle();
      return;
    }
    render({ hideDealerHole: true });
    els.msg.textContent = "HIT OR STAND";
    showPlay(true);
  };

  const hit = () => {
    player.cards.push(draw());
    dealSfx();
    const { total } = handValue(player.cards);
    if (total > 21) {
      render();
      settle("BUST — DEALER WINS", -bet);
      return;
    }
    render({ hideDealerHole: true });
    if (total === 21) stand(); // auto-stand on 21
    else showPlay(player.cards.length === 2);
  };

  const stand = () => {
    render(); // reveal hole card
    // dealer draws to 17, stands on soft 17
    while (handValue(dealer.cards).total < 17) {
      dealer.cards.push(draw());
      dealSfx();
    }
    render();
    const p = handValue(player.cards).total;
    const d = handValue(dealer.cards).total;
    if (d > 21) settle("DEALER BUSTS — YOU WIN", bet);
    else if (p > d) settle("YOU WIN", bet);
    else if (p < d) settle("DEALER WINS", -bet);
    else settle("PUSH", 0);
  };

  const doubleDown = () => {
    if (bankroll < bet * 2) return; // double only if funds exist
    bet *= 2;
    syncHud();
    player.cards.push(draw());
    dealSfx();
    const { total } = handValue(player.cards);
    if (total > 21) {
      render();
      settle("BUST — DEALER WINS", -bet);
      return;
    }
    stand();
  };

  const settle = (msg, delta) => {
    bankroll += delta;
    localStorage.setItem("brutal21_bankroll", String(bankroll));
    els.msg.textContent = `${msg} ${delta > 0 ? "+" : delta < 0 ? "−" : ""}${fmt(Math.abs(delta))}`;
    if (delta > 0) winSfx();
    else if (delta < 0) loseSfx();
    else pushSfx();

    if (bankroll <= 0) {
      els.msg.textContent = "BUSTED — BANKROLL EMPTY. RESETTING TO $100.";
      bankroll = 100;
      localStorage.setItem("brutal21_bankroll", "100");
      winSfx();
    }

    bet = Math.min(bet, Math.max(5, Math.floor(bankroll / (bet * 2 > bankroll ? 2 : 1)) * 5)) || 10;
    if (bet > bankroll) bet = Math.max(5, Math.floor(bankroll / 5) * 5) || 5;
    bet = Math.min(bet, betMax());
    showBet();
  };

  // player or dealer natural → 3:2 for player natural, standard otherwise
  const settleNaturals = () => {
    const pb = isBlackjack(player.cards);
    const db = isBlackjack(dealer.cards);
    if (pb && db) return settle("BOTH BLACKJACK — PUSH", 0);
    if (pb) return settle("BLACKJACK! PAYS 3:2", Math.floor(bet * 1.5));
    return settle("DEALER BLACKJACK", -bet);
  };

  // ── wiring ───────────────────────────────────────────────────────────
  els.dealBtn.addEventListener("click", () => {
    player = { cards: [] };
    dealer = { cards: [] };
    shoe = shoe.length ? shoe : buildShoe();
    player.cards.push(draw(), draw());
    dealer.cards.push(draw(), draw());

    render({ hideDealerHole: true });
    if (isBlackjack(player.cards) || isBlackjack(dealer.cards)) {
      // reveal, then settle naturals
      render();
      settleNaturals();
      return;
    }
    els.msg.textContent = "HIT OR STAND";
    showPlay(true);
  });

  els.hitBtn.addEventListener("click", () => { if (phase === "play") hit(); });
  els.standBtn.addEventListener("click", () => { if (phase === "play") stand(); });
  els.doubleBtn.addEventListener("click", () => { if (phase === "play") doubleDown(); });

  els.betMinus.addEventListener("click", () => { bet = Math.max(5, bet - 5); syncHud(); });
  els.betPlus.addEventListener("click", () => { bet = Math.min(betMax(), bet + 5); syncHud(); });

  // sound toggle
  $("soundBtn").addEventListener("click", (e) => {
    soundOn = !soundOn;
    e.currentTarget.setAttribute("aria-pressed", String(soundOn));
    e.currentTarget.textContent = `SOUND: ${soundOn ? "ON" : "OFF"}`;
    unlockAudio();
  });

  // keyboard: h = hit, s = stand, d = double, enter/space = deal
  document.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    unlockAudio();
    if (phase === "bet" && (e.code === "Enter" || e.code === "Space")) { e.preventDefault(); els.dealBtn.click(); }
    else if (phase === "play") {
      if (e.code === "KeyH") hit();
      else if (e.code === "KeyS") stand();
      else if (e.code === "KeyD" && !els.doubleBtn.hidden) doubleDown();
    }
  });

  // ── boot ─────────────────────────────────────────────────────────────
  player = { cards: [] };
  dealer = { cards: [] };
  shoe = buildShoe();
  els.msg.textContent = "PLACE YOUR BET";
  syncHud();
  registerSW();
})();

function registerSW() {
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => { /* offline cache unavailable */ });
  }
}
