// =====================================================================
// BRUTAL BIRD — canvas flappy game, brutalist black/white.
// No assets: everything drawn with rects (ink on paper).
// WebAudio synthesized SFX (no files). High score in localStorage.
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

  const flapSfx = () => beep(660, 0.06, "square", 0.06);
  const scoreSfx = () => { beep(880, 0.07); setTimeout(() => beep(1320, 0.09), 70); };
  const hitSfx = () => { beep(160, 0.25, "sawtooth", 0.12); setTimeout(() => beep(110, 0.3, "sawtooth", 0.1), 90); };

  // ── constants ────────────────────────────────────────────────────────
  const W = 480, H = 640;              // logical canvas size
  const GRAVITY = 1500;                // px/s^2
  const FLAP_VY = -420;                // px/s
  const PIPE_W = 70;
  const GAP_START = 185;               // gap height at score 0
  const GAP_MIN = 120;                 // gap height at max difficulty
  const GAP_TIGHTEN = 5;               // px lost per point
  const PIPE_SPEED_START = 165;        // px/s at score 0
  const PIPE_SPEED_MAX = 260;          // px/s cap
  const PIPE_ACCEL = 2.2;              // px/s gained per point
  const PIPE_INTERVAL = 1.55;          // seconds between pipes
  const BIRD_X = 110, BIRD_R = 16;     // bird position & radius (square bird, r = half-size)

  // ── state ────────────────────────────────────────────────────────────
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlaySub = document.getElementById("overlaySub");
  const overlayScore = document.getElementById("overlayScore");
  const installHint = document.getElementById("installHint");
  const startBtn = document.getElementById("startBtn");
  const soundBtn = document.getElementById("soundBtn");

  let bird, pipes, score, best, running, lastT, spawnTimer, groundOffset;
  best = Number(localStorage.getItem("brutalbird_best") ?? 0);
  bestEl.textContent = `BEST ${best}`;

  const resetGame = () => {
    bird = { y: H * 0.4, vy: 0 };
    pipes = [];
    score = 0;
    running = false;
    spawnTimer = 0;
    groundOffset = 0;
    scoreEl.textContent = "0";
  };

  const gapAt = () => Math.max(GAP_MIN, GAP_START - GAP_TIGHTEN * score);
  const speedAt = () => Math.min(PIPE_SPEED_MAX, PIPE_SPEED_START + PIPE_ACCEL * score);

  const spawnPipe = () => {
    const gap = gapAt();
    const margin = 60;
    const top = margin + Math.random() * (H - gap - margin * 2);
    pipes.push({ x: W + PIPE_W, top, gap, scored: false });
  };

  // ── rendering ────────────────────────────────────────────────────────
  const ink = () => (root.dataset.theme === "dark" ? "#ffffff" : "#000000");
  const paper = () => (root.dataset.theme === "dark" ? "#000000" : "#ffffff");
  const soft = () => (root.dataset.theme === "dark" ? "#1c1c1c" : "#f2f2f2");

  const draw = () => {
    ctx.fillStyle = paper();
    ctx.fillRect(0, 0, W, H);

    // pipes — hard black blocks with hatching
    ctx.fillStyle = ink();
    for (const p of pipes) {
      ctx.fillRect(p.x, 0, PIPE_W, p.top);
      ctx.fillRect(p.x, p.top + p.gap, PIPE_W, H - p.top - p.gap);
      // gap edge caps, 8px thick, hatched
      ctx.fillStyle = soft();
      ctx.fillRect(p.x, p.top - 8, PIPE_W, 8);
      ctx.fillRect(p.x, p.top + p.gap, PIPE_W, 8);
      ctx.fillStyle = ink();
    }

    // bird — square with an eye and a beak notch
    const bx = BIRD_X - BIRD_R, by = bird.y - BIRD_R, s = BIRD_R * 2;
    ctx.fillStyle = ink();
    ctx.fillRect(bx, by, s, s);
    // eye (paper square)
    ctx.fillStyle = paper();
    ctx.fillRect(bx + s * 0.55, by + s * 0.2, 6, 6);
    // beak notch (paper strip on right edge)
    ctx.fillRect(bx + s, by + s * 0.45, 5, 4);
    ctx.fillStyle = ink();

    // scrolling ground dashes
    ctx.fillStyle = soft();
    for (let x = -groundOffset % 24; x < W; x += 24) {
      ctx.fillRect(x, H - 28, 12, 4);
    }
    ctx.fillStyle = ink();
    ctx.fillRect(0, H - 24, W, 24);
  };

  // ── game loop ────────────────────────────────────────────────────────
  const step = (dt) => {
    bird.vy += GRAVITY * dt;
    bird.y += bird.vy * dt;
    groundOffset += speedAt() * dt;

    const speed = speedAt();
    for (const p of pipes) p.x -= speed * dt;
    pipes = pipes.filter((p) => p.x + PIPE_W > -10);

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnPipe();
      spawnTimer = PIPE_INTERVAL;
    }

    // scoring
    for (const p of pipes) {
      if (!p.scored && p.x + PIPE_W < BIRD_X - BIRD_R) {
        p.scored = true;
        score++;
        scoreEl.textContent = String(score);
        scoreSfx();
      }
    }

    // collisions: ground / ceiling / pipes
    if (bird.y + BIRD_R >= H - 24 || bird.y - BIRD_R <= 0) return die();
    for (const p of pipes) {
      const hitX = BIRD_X + BIRD_R > p.x && BIRD_X - BIRD_R < p.x + PIPE_W;
      const hitY = bird.y - BIRD_R < p.top || bird.y + BIRD_R > p.top + p.gap;
      if (hitX && hitY) return die();
    }
  };

  const frame = (t) => {
    const dt = Math.min((t - lastT) / 1000, 0.033);
    lastT = t;
    if (running) step(dt);
    draw();
    requestAnimationFrame(frame);
  };

  // ── flow ─────────────────────────────────────────────────────────────
  const start = () => {
    if (running) return;
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ }
    }
    audioCtx?.resume?.();
    resetGame();
    running = true;
    overlay.style.display = "none";
    flap();
  };

  const die = () => {
    running = false;
    hitSfx();
    if (score > best) {
      best = score;
      localStorage.setItem("brutalbird_best", String(best));
      bestEl.textContent = `BEST ${best}`;
    }
    overlayTitle.innerHTML = "GAME<br>OVER";
    overlaySub.textContent = "TAP / SPACE TO RETRY";
    overlayScore.hidden = false;
    overlayScore.textContent = `SCORE ${score} · BEST ${best}`;
    overlay.style.display = "";
  };

  const flap = () => {
    if (!running) return;
    bird.vy = FLAP_VY;
    flapSfx();
  };

  // ── input ────────────────────────────────────────────────────────────
  const isOverlayVisible = () => overlay.style.display !== "none";

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (isOverlayVisible()) { start(); return; }
    flap();
  });

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      if (isOverlayVisible()) start();
      else flap();
    }
  });

  startBtn.addEventListener("click", start);

  // sound toggle
  soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    soundBtn.setAttribute("aria-pressed", String(soundOn));
    soundBtn.textContent = `SOUND: ${soundOn ? "ON" : "OFF"}`;
    if (soundOn && !audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ }
    }
  });

  // ── boot ─────────────────────────────────────────────────────────────
  resetGame();
  lastT = performance.now();
  requestAnimationFrame(frame);
  registerSW();
})();

// ── service worker (kept outside the IIFE so failures don't kill the game) ──
function registerSW() {
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => { /* offline cache unavailable */ });
  }
}
