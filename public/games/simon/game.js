// =====================================================================
// SIMON — brutalist memory game. 2x2 pad grid, growing sequence.
// Rounds: playback highlights each pad with a distinct tone;
// player repeats by tapping (or keys 1-4). Wrong pad → game over.
// Best round count persisted in localStorage. WebAudio synth tones.
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

  // one tone per pad, spanning an octave-ish major chord arc
  const PAD_FREQS = [261.63, 329.63, 392.0, 523.25];
  const padTone = (pad, dur = 0.28) => beep(PAD_FREQS[pad], dur, "square", 0.09);
  const winTone = () => {
    beep(523.25, 0.08);
    setTimeout(() => beep(783.99, 0.12), 90);
  };
  const failTone = () => {
    beep(160, 0.25, "sawtooth", 0.12);
    setTimeout(() => beep(110, 0.3, "sawtooth", 0.1), 90);
  };

  const unlockAudio = () => {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ }
    }
    audioCtx?.resume?.();
  };

  // ── DOM ──────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const els = {
    round: $("round"), best: $("best"), msg: $("msg"), pads: $("pads"),
    padsBtns: [ $("pad0"), $("pad1"), $("pad2"), $("pad3") ],
    overlay: $("overlay"), overlayTitle: $("overlayTitle"),
    overlaySub: $("overlaySub"), overlayScore: $("overlayScore"),
    startBtn: $("startBtn"), soundBtn: $("soundBtn"),
  };

  // ── constants ────────────────────────────────────────────────────────
  const PAD_CLASSES = ["pad--red", "pad--blue", "pad--green", "pad--yellow"];
  els.padsBtns.forEach((b, i) => b.classList.add(PAD_CLASSES[i]));
  const HIGHLIGHT_MS = 420;   // per-pad playback highlight
  const GAP_MS = 120;         // dark gap between highlights
  const INK_MS = 160;         // brief flash on player taps

  // ── state ────────────────────────────────────────────────────────────
  let sequence = [];   // pads pressed so far this game
  let inputPos = 0;    // index into sequence the player must match
  let round = 0;       // completed rounds
  let playing = false; // playback in progress (input locked)
  let inputOn = false; // accepting player input
  let timers = [];     // pending setTimeout handles
  let best = Number(localStorage.getItem("simon_best") ?? 0);
  els.best.textContent = `BEST ${best}`;

  // ── pure core (state machine, no DOM) ────────────────────────────────
  const nextPad = (rand = Math.random) => Math.floor(rand() * 4);
  const extend = (seq = [], rand = Math.random) => [...seq, nextPad(rand)];
  // returns "advance" | "wrong" for a player tap at the current position
  const judge = (seq, pos, pad) => (seq[pos] === pad ? (pos === seq.length - 1 ? "advance" : "continue") : "wrong");

  // ── rendering ────────────────────────────────────────────────────────
  const highlight = (pad, ms, cls = "pad--active") => {
    els.padsBtns[pad].classList.add(cls);
    timers.push(setTimeout(() => els.padsBtns[pad].classList.remove(cls), ms));
  };

  const playback = () => {
    playing = true;
    inputOn = false;
    els.msg.textContent = "WATCH";
    let i = 0;
    const step = () => {
      if (i >= sequence.length) {
        playing = false;
        inputOn = true;
        inputPos = 0;
        els.msg.textContent = "YOUR TURN";
        return;
      }
      const pad = sequence[i];
      padTone(pad, HIGHLIGHT_MS / 1000);
      highlight(pad, HIGHLIGHT_MS);
      i++;
      timers.push(setTimeout(step, HIGHLIGHT_MS + GAP_MS));
    };
    step();
  };

  const setLocked = (locked) => {
    for (const b of els.padsBtns) b.disabled = locked;
  };

  const startRound = () => {
    sequence = extend(sequence);
    round = sequence.length; // "round 1" begins when the sequence reaches length 1
    els.round.textContent = String(round);
    els.msg.textContent = "WATCH";
    setLocked(true);
    playback();
    setLocked(true);
  };

  const endGame = () => {
    inputOn = false;
    setLocked(true);
    failTone();
    // round completed = rounds where the full sequence was repeated → round - 1
    const completed = Math.max(0, round - 1);
    if (completed > best) {
      best = completed;
      localStorage.setItem("simon_best", String(best));
      els.best.textContent = `BEST ${best}`;
    }
    els.overlayTitle.innerHTML = "GAME<br>OVER";
    els.overlaySub.textContent = "TAP PADS OR KEYS 1-4";
    els.overlayScore.hidden = false;
    els.overlayScore.textContent = `ROUNDS ${completed} · BEST ${best}`;
    els.overlay.style.display = "";
  };

  const onPad = (pad) => {
    if (!inputOn || playing) return;
    highlight(pad, INK_MS);
    padTone(pad, 0.2);
    const verdict = judge(sequence, inputPos, pad);
    if (verdict === "wrong") return endGame();
    inputPos++;
    if (verdict === "advance") {
      // full sequence repeated → schedule next extension after a beat
      inputPos = 0;
      inputOn = false;
      winTone();
      timers.push(setTimeout(startRound, 600));
    }
  };

  const start = () => {
    unlockAudio();
    for (const t of timers) clearTimeout(t);
    timers = [];
    sequence = [];
    inputPos = 0;
    round = 0;
    els.round.textContent = "0";
    els.overlay.style.display = "none";
    startRound();
  };

  // ── wiring ───────────────────────────────────────────────────────────
  els.startBtn.addEventListener("click", start);
  // tap anywhere on the instructions panel = start (touch-first)
  document.querySelector(".overlay__panel")?.addEventListener("click", (e) => {
    if (e.target !== els.startBtn) start();
  });
  for (const b of els.padsBtns) {
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      unlockAudio();
      onPad(Number(e.currentTarget.dataset.pad));
    });
  }

  // keyboard: keys 1-4 tap pads; Enter/Space starts from the overlay
  document.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    unlockAudio();
    if (els.overlay.style.display !== "none") {
      if (e.code === "Enter" || e.code === "Space") { e.preventDefault(); start(); }
      return;
    }
    const pad = Number(e.key) - 1;
    if (pad >= 0 && pad <= 3) onPad(pad);
  });

  // sound toggle
  els.soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    els.soundBtn.setAttribute("aria-pressed", String(soundOn));
    els.soundBtn.textContent = `SOUND: ${soundOn ? "ON" : "OFF"}`;
    unlockAudio();
  });

  // ── boot ─────────────────────────────────────────────────────────────
  setLocked(true);
  registerSW();
})();

// ── service worker (kept outside the IIFE so failures don't kill the game) ──
function registerSW() {
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => { /* offline cache unavailable */ });
  }
}
