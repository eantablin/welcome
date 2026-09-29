// =====================================================================
// MEMORY PAIRS — brutalist memory card game.
// 4x4 grid, 8 pairs of monochrome playing-card glyphs (A K Q J + suits).
// Tap a card → face up; two face up: match → stays revealed, mismatch →
// flips back after 650ms (input locked while waiting). Move = one pair of
// flips. Win when all 8 pairs matched. Best (fewest moves, > 0) persisted.
// WebAudio synth SFX, gated behind a user gesture.
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

  const flipSfx = () => beep(520, 0.05, "square", 0.05);
  const matchSfx = () => { beep(660, 0.08); setTimeout(() => beep(990, 0.12), 90); };
  const missSfx = () => beep(140, 0.18, "sawtooth", 0.08);
  const winSfx = () => { beep(660, 0.08); setTimeout(() => beep(990, 0.12), 90); setTimeout(() => beep(1320, 0.16), 210); };

  const unlockAudio = () => {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ }
    }
    audioCtx?.resume?.();
  };

  // ── DOM ──────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const els = {
    moves: $("moves"), best: $("best"),
    grid: $("grid"), overlay: $("overlay"),
    overlayScore: $("overlayScore"), startBtn: $("startBtn"),
    soundBtn: $("soundBtn"),
  };
  const cells = els.grid ? Array.from(els.grid.querySelectorAll(".cell")) : [];

  // ── constants / state ────────────────────────────────────────────────
  const RANKS = ["A", "K", "Q", "J"];
  const SUITS = ["♠", "♥", "♦", "♣"];
  const FLIP_BACK_MS = 650;

  const DECK = (() => {
    const glyphs = [];
    for (const r of RANKS) for (const s of SUITS) glyphs.push(r + s);
    return glyphs; // 16 glyph values — deal duplicates each → 8 pairs
  })();

  let deck = [];      // shuffled glyph per index
  let up = [];        // indices of face-up cards (length 0, 1 or 2)
  let matched = [];   // per-index boolean
  let moves = 0;
  let locked = false;
  let best = Number(localStorage.getItem("pairs_best") ?? 0) || 0;

  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const matchedCount = () => matched.filter(Boolean).length;

  const syncHud = () => {
    els.moves.textContent = String(moves);
    els.best.textContent = "BEST " + (best > 0 ? best : "\u2014");
  };

  const renderCell = (i) => {
    const el = cells[i];
    if (!el) return;
    const face = "<span class=\"cell__face\">" + deck[i] + "</span>";
    if (matched[i]) {
      el.classList.remove("cell--up");
      el.classList.add("cell--matched");
      el.innerHTML = face;
      el.setAttribute("aria-label", "CARD " + (i + 1) + ", MATCHED " + deck[i]);
      el.disabled = true;
    } else if (up.includes(i)) {
      el.classList.add("cell--up");
      el.innerHTML = face;
      el.setAttribute("aria-label", "CARD " + (i + 1) + ", FACE UP " + deck[i]);
    } else {
      el.classList.remove("cell--up");
      el.classList.remove("cell--matched");
      el.innerHTML = "";
      el.setAttribute("aria-label", "CARD " + (i + 1) + ", FACE DOWN");
      el.disabled = locked;
    }
  };

  const render = () => {
    for (let i = 0; i < 16; i++) renderCell(i);
    syncHud();
  };

  const finish = () => {
    if (moves > 0 && (best === 0 || moves < best)) {
      best = moves;
      localStorage.setItem("pairs_best", String(best));
      els.overlayScore.innerHTML =
        "NEW BEST — SOLVED IN <strong>" + moves + "</strong> MOVES";
    } else {
      els.overlayScore.innerHTML =
        "SOLVED IN <strong>" + moves + "</strong> MOVES — BEST " + (best > 0 ? best : "\u2014");
    }
    els.overlayScore.hidden = false;
    els.overlay.hidden = false;
    els.startBtn.textContent = "PLAY AGAIN";
    els.startBtn.focus?.();
    winSfx();
  };

  // resolve a full pair of face-up cards: exactly one move
  const resolvePair = () => {
    const [a, b] = up;
    moves++;
    if (deck[a] === deck[b]) {
      // match: stay inverted (revealed), keep accepting input
      matched[a] = matched[b] = true;
      up = [];
      renderCell(a);
      renderCell(b);
      matchSfx();
      if (matchedCount() === 16) setTimeout(finish, 0);
    } else {
      // mismatch: lock input, flip back after 650ms
      locked = true;
      missSfx();
      setTimeout(() => {
        up = [];
        locked = false;
        render();
      }, FLIP_BACK_MS);
    }
    syncHud();
  };

  const flip = (i) => {
    if (locked || matched[i] || up.includes(i) || up.length >= 2) return;
    up.push(i);
    renderCell(i);
    flipSfx();
    if (up.length === 2) resolvePair();
  };

  const newGame = () => {
    // 16 cells = 8 pairs: pick 8 random glyphs, deal each exactly twice
    const base = shuffle(DECK).slice(0, 8);
    deck = shuffle([...base, ...base]);
    up = [];
    matched = new Array(16).fill(false);
    moves = 0;
    locked = false;
    els.overlay.hidden = true;
    els.overlayScore.hidden = true;
    els.startBtn.textContent = "PRESS START";
    render();
  };

  const start = () => { unlockAudio(); newGame(); };
  els.startBtn.addEventListener("click", start);

  els.grid.addEventListener("click", (e) => {
    const idx = cells.indexOf(e.target.closest(".cell"));
    if (idx >= 0) { unlockAudio(); flip(idx); }
  });

  // keyboard: arrows move focus + flip, Enter/Space restarts on overlay
  document.addEventListener("keydown", (ev) => {
    if (!els.overlay.hidden) {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); start(); }
      return;
    }
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      const i = cells.indexOf(document.activeElement);
      if (i >= 0) flip(i);
      return;
    }
    const arrows = { ArrowUp: -4, ArrowDown: 4, ArrowLeft: -1, ArrowRight: 1 };
    const d = arrows[ev.key];
    if (!d) return;
    ev.preventDefault();
    const cur = cells.indexOf(document.activeElement);
    const i = Math.max(0, Math.min(15, cur + d));
    cells[i]?.focus();
    flip(i);
  });

  // sound toggle
  els.soundBtn.addEventListener("click", (e) => {
    soundOn = !soundOn;
    e.currentTarget.setAttribute("aria-pressed", String(soundOn));
    e.currentTarget.textContent = "SOUND: " + (soundOn ? "ON" : "OFF");
    unlockAudio();
  });

  document.addEventListener("DOMContentLoaded", syncHud);
})();

function registerSW() {
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => { /* offline cache unavailable */ });
  }
}

registerSW();
