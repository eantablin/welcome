// =====================================================================
// BRUTAL WHACK — brutalist whack-a-mole.
// 3x3 hole grid, 30-second round. The mole never repeats a hole back to
// back. Whack = +10, mole relocates immediately; idle it relocates on a
// 600–1000ms timer. Best score in localStorage. WebAudio synth SFX.
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

  const whackSfx = () => { beep(660, 0.06); setTimeout(() => beep(1100, 0.08), 60); };
  const missSfx = () => beep(150, 0.1, "sawtooth", 0.05);
  const endSfx = () => { beep(220, 0.2, "sawtooth", 0.1); setTimeout(() => beep(110, 0.3, "sawtooth", 0.08), 160); };

  // ── constants ────────────────────────────────────────────────────────
  const ROUND_MS = 30000;        // round length
  const HOLE_COUNT = 9;          // 3x3 grid
  const POP_MIN = 0.6;           // shortest mole stay, seconds
  const POP_MAX = 1.0;           // longest mole stay, seconds
  const POINTS = 10;             // points per whack

  // ── DOM ──────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const els = {
    score: $("score"), best: $("best"), time: $("time"),
    overlay: $("overlay"), overlayTitle: $("overlayTitle"),
    overlaySub: $("overlaySub"), overlayScore: $("overlayScore"),
    startBtn: $("startBtn"), soundBtn: $("soundBtn"),
  };
  const holes = Array.from({ length: HOLE_COUNT }, (_, i) => $(`m${i}`));

  // ── state ────────────────────────────────────────────────────────────
  let best = Number(localStorage.getItem("whack_score") ?? 0);
  let score = 0, timeLeft = 0, moleHole = -1, lastHole = -1, popLeft = 0;
  let phase; // "ready" | "play" | "over"

  const updateHud = () => {
    els.score.textContent = String(score);
    els.best.textContent = `BEST ${best}`;
    els.time.textContent = `${(Math.max(0, timeLeft) / 1000).toFixed(1)}s`;
    holes.forEach((h, i) => h.classList.toggle("hole--mole", i === moleHole));
  };

  // ── mole movement ────────────────────────────────────────────────────
  // New hole must differ from the hole the mole just left.
  const nextHole = () => {
    let h = Math.floor(Math.random() * HOLE_COUNT);
    if (h === lastHole) {
      h = (h + 1 + Math.floor(Math.random() * (HOLE_COUNT - 1))) % HOLE_COUNT;
    }
    return h;
  };

  const relocate = () => {
    if (moleHole >= 0) lastHole = moleHole;
    moleHole = nextHole();
    popLeft = POP_MIN + Math.random() * (POP_MAX - POP_MIN);
  };

  // ── core loop ────────────────────────────────────────────────────────
  const step = (dt) => {
    if (phase !== "play") return;
    timeLeft -= dt * 1000;
    popLeft -= dt;
    if (timeLeft <= 0) { timeLeft = 0; updateHud(); return endRound(); }
    if (popLeft <= 0) relocate();
    updateHud();
  };

  // ── actions ──────────────────────────────────────────────────────────
  const whack = (i) => {
    if (phase !== "play") return;
    if (i !== moleHole) { missSfx(); return; }
    score += POINTS;
    whackSfx();
    relocate(); // mole relocates immediately after a hit
    updateHud();
  };

  const endRound = () => {
    phase = "over";
    endSfx();
    if (score > best) {
      best = score;
      localStorage.setItem("whack_score", String(best));
    }
    els.overlayTitle.innerHTML = "ROUND<br>OVER";
    els.overlaySub.textContent = "";
    els.overlayScore.hidden = false;
    els.overlayScore.textContent = `SCORE ${score} · BEST ${best}`;
    els.overlay.hidden = false;
    updateHud();
  };

  const resetGame = () => {
    score = 0;
    timeLeft = ROUND_MS;
    moleHole = -1;
    lastHole = -1;
    popLeft = 0;
  };

  const start = () => {
    if (phase === "play") return;
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ }
    }
    audioCtx?.resume?.();
    phase = "play";
    resetGame();
    relocate();
    els.overlay.hidden = true;
    els.overlayScore.hidden = true;
    updateHud();
  };

  const isOverlayVisible = () => !els.overlay.hidden;

  // ── input ────────────────────────────────────────────────────────────
  holes.forEach((h, i) => {
    h.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (isOverlayVisible()) return; // overlay start button handles it
      whack(i);
    });
  });

  // keyboard: 1–9 whack that hole; Enter/Space starts from the overlay
  document.addEventListener("keydown", (e) => {
    if (isOverlayVisible()) {
      if (e.code === "Enter" || e.code === "Space") { e.preventDefault(); start(); }
      return;
    }
    const idx = "123456789".indexOf(e.key);
    if (idx >= 0) whack(idx);
  });

  els.startBtn.addEventListener("click", start);

  // sound toggle
  els.soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    els.soundBtn.setAttribute("aria-pressed", String(soundOn));
    els.soundBtn.textContent = `SOUND: ${soundOn ? "ON" : "OFF"}`;
    if (soundOn && !audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ }
    }
  });

  // ── boot ─────────────────────────────────────────────────────────────
  phase = "ready";
  els.overlay.hidden = false;
  updateHud();

  let lastT = performance.now();
  const frame = (t) => {
    const dt = Math.min((t - lastT) / 1000, 0.033);
    lastT = t;
    step(dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  registerSW();
})();

function registerSW() {
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => { /* offline cache unavailable */ });
  }
}
