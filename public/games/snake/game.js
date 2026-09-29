// =====================================================================
// SNAKE — canvas grid game, brutalist black/white.
// No assets: everything drawn with rects (ink on paper).
// WebAudio synthesized SFX (no files). Best score in localStorage.
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

  const eatSfx = () => { beep(880, 0.07); setTimeout(() => beep(1320, 0.09), 70); };
  const dieSfx = () => { beep(160, 0.25, "sawtooth", 0.12); setTimeout(() => beep(110, 0.3, "sawtooth", 0.1), 90); };

  // ── constants ────────────────────────────────────────────────────────
  const W = 480, H = 480;              // logical canvas size
  const COLS = 20, ROWS = 20;          // grid
  const CELL = W / COLS;               // 24 px per cell
  const TICK_START = 140;              // ms per move
  const TICK_MIN = 70;                 // speed floor
  const RAMP_STEP = 10;                // ms shaved per ramp
  const FOODS_PER_RAMP = 5;            // speed ramps every 5 foods
  const START_LEN = 3;

  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  // ── state ────────────────────────────────────────────────────────────
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlaySub = document.getElementById("overlaySub");
  const overlayScore = document.getElementById("overlayScore");
  const overlayHint = document.getElementById("overlayHint");
  const startBtn = document.getElementById("startBtn");
  const soundBtn = document.getElementById("soundBtn");

  let snake, dir, queue, food, score, eaten, best, running, over, acc;
  best = Number(localStorage.getItem("snake_best") ?? 0);
  bestEl.textContent = `BEST ${best}`;

  const tickMs = () =>
    Math.max(TICK_MIN, TICK_START - RAMP_STEP * Math.floor(eaten / FOODS_PER_RAMP));

  const resetGame = () => {
    snake = [];
    const cy = Math.floor(ROWS / 2);
    for (let i = 0; i < START_LEN; i++) snake.push({ x: 4 - i, y: cy });
    dir = DIRS.right;
    queue = [];
    score = 0;
    eaten = 0;
    running = false;
    over = false;
    acc = 0;
    spawnFood();
    scoreEl.textContent = "0";
  };

  const spawnFood = () => {
    const free = [];
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        if (!snake.some((s) => s.x === x && s.y === y)) free.push({ x, y });
    food = free.length ? free[(Math.random() * free.length) | 0] : null;
  };

  // one tick of pure game logic: consume queued turn, move, eat, die
  const step = () => {
    if (queue.length) {
      const nd = queue.shift();
      if (nd.x !== -dir.x || nd.y !== -dir.y) dir = nd; // 180° reversal blocked
    }
    const head = snake[0];
    const nx = head.x + dir.x;
    const ny = head.y + dir.y;

    // wall collision
    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return die();

    const ate = food !== null && nx === food.x && ny === food.y;
    // cells the snake still occupies after this move (tail vacates unless growing)
    const body = ate ? snake : snake.slice(0, -1);
    if (body.some((s) => s.x === nx && s.y === ny)) return die(); // self collision

    snake.unshift({ x: nx, y: ny });
    if (ate) {
      score += 10;
      eaten++;
      scoreEl.textContent = String(score);
      eatSfx();
      spawnFood();
    } else {
      snake.pop();
    }
  };

  // ── rendering ────────────────────────────────────────────────────────
  const ink = () => (root.dataset.theme === "dark" ? "#ffffff" : "#000000");
  const paper = () => (root.dataset.theme === "dark" ? "#000000" : "#ffffff");
  const soft = () => (root.dataset.theme === "dark" ? "#1c1c1c" : "#f2f2f2");

  const draw = (t) => {
    ctx.fillStyle = paper();
    ctx.fillRect(0, 0, W, H);

    // grid lines
    ctx.fillStyle = soft();
    for (let i = 1; i < COLS; i++) ctx.fillRect(i * CELL - 1, 0, 2, H);
    for (let j = 1; j < ROWS; j++) ctx.fillRect(0, j * CELL - 1, W, 2);

    // snake — filled ink blocks
    ctx.fillStyle = ink();
    for (const s of snake) {
      ctx.fillRect(s.x * CELL, s.y * CELL, CELL, CELL);
    }
    // head eye (paper notch) so direction reads at a glance
    const h = snake[0];
    ctx.fillStyle = paper();
    ctx.fillRect(
      h.x * CELL + CELL * (0.5 + dir.x * 0.25) - 2,
      h.y * CELL + CELL * (0.5 + dir.y * 0.25) - 2,
      5, 5
    );

    // food — blinking outline block
    if (food) {
      const blinkOn = Math.floor(t / 250) % 2 === 0;
      if (blinkOn) {
        ctx.fillStyle = ink();
        ctx.fillRect(food.x * CELL + 3, food.y * CELL + 3, CELL - 6, 4);
        ctx.fillRect(food.x * CELL + 3, food.y * CELL + CELL - 7, CELL - 6, 4);
        ctx.fillRect(food.x * CELL + 3, food.y * CELL + 3, 4, CELL - 6);
        ctx.fillRect(food.x * CELL + CELL - 7, food.y * CELL + 3, 4, CELL - 6);
      }
    }
  };

  // ── game loop ────────────────────────────────────────────────────────
  const frame = (t) => {
    if (running) {
      acc += Math.min(t - (frame.lastT ?? t), 100);
      let interval = tickMs();
      while (acc >= interval) {
        acc -= interval;
        step();
        if (!running) { acc = 0; break; }
        interval = tickMs();
      }
    }
    frame.lastT = t;
    draw(t);
    requestAnimationFrame(frame);
  };

  // ── flow ─────────────────────────────────────────────────────────────
  const isOverlayVisible = () => overlay.style.display !== "none";

  const start = () => {
    if (running) return;
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ }
    }
    audioCtx?.resume?.();
    resetGame();
    running = true;
    overlay.style.display = "none";
  };

  const die = () => {
    running = false;
    over = true;
    dieSfx();
    if (score > best) {
      best = score;
      localStorage.setItem("snake_best", String(best));
      bestEl.textContent = `BEST ${best}`;
    }
    overlayTitle.innerHTML = "GAME<br>OVER";
    overlaySub.textContent = "TAP / SPACE TO RETRY";
    overlayScore.hidden = false;
    overlayScore.textContent = `SCORE ${score} · BEST ${best}`;
    overlayHint.hidden = true;
    overlay.style.display = "";
  };

  // ── input ────────────────────────────────────────────────────────────
  const turn = (d) => {
    // compare against the last queued turn so two quick turns both register
    const last = queue.length ? queue[queue.length - 1] : dir;
    if (d.x === last.x && d.y === last.y) return;
    queue.push(d);
    if (queue.length > 3) queue.shift();
  };

  const KEY_DIRS = {
    ArrowUp: DIRS.up, KeyW: DIRS.up,
    ArrowDown: DIRS.down, KeyS: DIRS.down,
    ArrowLeft: DIRS.left, KeyA: DIRS.left,
    ArrowRight: DIRS.right, KeyD: DIRS.right,
  };

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      if (isOverlayVisible()) start();
      return;
    }
    const d = KEY_DIRS[e.code];
    if (!d) return;
    e.preventDefault();
    if (isOverlayVisible()) { start(); return; }
    turn(d);
  });

  // swipe on canvas: axis of the larger delta wins; small movement = tap
  let swipe = null;
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    swipe = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener("pointerup", (e) => {
    e.preventDefault();
    if (!swipe) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    swipe = null;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (isOverlayVisible()) { start(); return; }
    if (Math.max(ax, ay) < 24) return; // tap — no direction
    turn(ax >= ay ? (dx > 0 ? DIRS.right : DIRS.left) : (dy > 0 ? DIRS.down : DIRS.up));
  });
  canvas.addEventListener("pointercancel", () => { swipe = null; });

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
  requestAnimationFrame(frame);
  registerSW();
})();

// ── service worker (kept outside the IIFE so failures don't kill the game) ──
function registerSW() {
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => { /* offline cache unavailable */ });
  }
}
