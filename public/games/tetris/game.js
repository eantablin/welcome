// =====================================================================
// TETRIS — 10x20 canvas falling-block game, brutalist signal colors.
// Flat riso spot colors on white paper / black ink, hard 2px block
// borders, no gradients, no easing. WebAudio synthesized SFX (no files).
// Best score in localStorage ("tetris_best"). Pure game core is exposed
// as globalThis.TetrisCore for scripts/smoke-tetris.mjs.
// =====================================================================

(() => {
  "use strict";

  // ── theme (respects site-wide dark mode) ─────────────────────────────
  const root = document.documentElement;
  root.dataset.theme =
    localStorage.getItem("theme") ??
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

  // ── pure core (no DOM access — exported for the smoke suite) ─────────
  const COLS = 10, ROWS = 20;
  const CELL = 30; // logical canvas is 300x600

  // spawn orientation stored as [x, y] cells inside an `size x size` box
  const SHAPES = {
    I: { size: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]], spawnX: 3 },
    O: { size: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]], spawnX: 4 },
    T: { size: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]], spawnX: 3 },
    S: { size: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]], spawnX: 3 },
    Z: { size: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]], spawnX: 3 },
    J: { size: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]], spawnX: 3 },
    L: { size: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]], spawnX: 3 },
  };
  const KINDS = Object.keys(SHAPES);

  const emptyBoard = () =>
    Array.from({ length: ROWS }, () => Array(COLS).fill(null));

  // absolute board cells for a piece whose origin sits at (px, py)
  const cellsAt = (px, py, cells) => cells.map(([cx, cy]) => [px + cx, py + cy]);

  const collides = (board, cells) =>
    cells.some(([x, y]) => x < 0 || x >= COLS || y >= ROWS ||
      (y >= 0 && board[y][x]));

  // 90° clockwise inside the shape's size x size box
  const rotateCW = (shape, cells) =>
    cells.map(([x, y]) => [shape.size - 1 - y, x]);

  // SRS-lite kicks: horizontal offsets only, tried in order
  const KICKS = [0, -1, 1, -2, 2];
  const tryRotate = (shape, cells, px, py, board) => {
    const rotated = rotateCW(shape, cells);
    for (const dx of KICKS) {
      if (!collides(board, cellsAt(px + dx, py, rotated))) {
        return { cells: rotated, x: px + dx, y: py };
      }
    }
    return null;
  };

  const fullRows = (board) => {
    const rows = [];
    for (let y = 0; y < ROWS; y++) if (board[y].every(Boolean)) rows.push(y);
    return rows;
  };

  // remove `rows` (Set-friendly array) and collapse: survivors sink, empty rows stay on top
  const collapseRows = (board, rows) => {
    const gone = new Set(rows);
    const kept = board.filter((_, y) => !gone.has(y));
    while (kept.length < ROWS) kept.unshift(Array(COLS).fill(null));
    return kept;
  };

  const LEVEL_LINES = 10;
  const levelFor = (lines) => 1 + Math.floor(lines / LEVEL_LINES);

  const GRAVITY_START = 800; // ms per gravity step at level 1
  const GRAVITY_PER_LEVEL = 60; // ms shaved per level
  const gravityMs = (level) => GRAVITY_START - GRAVITY_PER_LEVEL * (level - 1);

  const LINE_PTS = [0, 100, 300, 500, 800]; // 1/2/3/4 lines
  const lineScore = (n, level) => LINE_PTS[n] * level;

  const SOFT_DIVISOR = 5; // soft drop = 5x gravity
  const SOFT_PTS = 1; // per cell descended
  const HARD_PTS = 2; // per cell descended
  const FLASH_MS = 120; // line-clear flash before collapse

  // ── signal colors — mirror the --sig-* tokens in style.css :root ─────
  // Same values on both themes (flat riso spots read on white AND black).
  const SIG = {
    I: { value: "#2ec5c5" }, // cyan — fixed
    O: { token: "--sig-yellow", hex: "#fcbf49" },
    T: { value: "#9b5de5" }, // purple — fixed
    S: { token: "--sig-green", hex: "#2f9e44" },
    Z: { token: "--sig-red", hex: "#d62828" },
    J: { token: "--sig-blue", hex: "#1c6dd0" },
    L: { token: "--sig-orange", hex: "#f77f00" },
  };

  const TetrisCore = {
    COLS, ROWS, CELL, SHAPES, KINDS, emptyBoard, cellsAt, collides,
    rotateCW, KICKS, tryRotate, fullRows, collapseRows,
    levelFor, gravityMs, lineScore, SOFT_DIVISOR, SOFT_PTS, HARD_PTS,
    FLASH_MS, GRAVITY_START,
  };
  globalThis.TetrisCore = TetrisCore;

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

  const moveSfx = () => beep(220, 0.04, "square", 0.05);
  const rotateSfx = () => beep(520, 0.06, "square", 0.06);
  const lockSfx = () => beep(160, 0.08, "square", 0.09);
  const clearSfx = () => {
    beep(660, 0.08);
    setTimeout(() => beep(880, 0.08), 80);
    setTimeout(() => beep(1320, 0.12), 160);
  };
  const dropSfx = () => beep(120, 0.12, "sawtooth", 0.12);
  const dieSfx = () => {
    beep(160, 0.25, "sawtooth", 0.12);
    setTimeout(() => beep(110, 0.3, "sawtooth", 0.1), 90);
  };

  // ── state ────────────────────────────────────────────────────────────
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");
  const nextCanvas = document.getElementById("next");
  const nextCtx = nextCanvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const levelEl = document.getElementById("level");
  const linesEl = document.getElementById("lines");
  const overlay = document.getElementById("overlay");
  const overlayPanel = document.getElementById("overlayPanel");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlaySub = document.getElementById("overlaySub");
  const overlayScore = document.getElementById("overlayScore");
  const overlayHint = document.getElementById("overlayHint");
  const startBtn = document.getElementById("startBtn");
  const soundBtn = document.getElementById("soundBtn");

  let board, cur, nextKind, score, lines, level, best, running, over, flash, acc;
  let softKey = false;   // ArrowDown held
  let softHeld = false;  // on-screen ▼ held
  let softUntil = 0;     // swipe-down burst window (ms timestamp)

  best = Number(localStorage.getItem("tetris_best") ?? 0);
  bestEl.textContent = `BEST ${best}`;

  const absCells = (p) => cellsAt(p.x, p.y, p.cells);
  const now = () => performance.now();

  const randomKind = () => KINDS[(Math.random() * KINDS.length) | 0];

  // soft drop active: held key, held button, or recent swipe-down burst
  const isSoft = () => softKey || softHeld || now() < softUntil;

  const intervalMs = () => {
    const g = gravityMs(level);
    return isSoft() ? g / SOFT_DIVISOR : g;
  };

  const syncHud = () => {
    scoreEl.textContent = String(score);
    levelEl.textContent = String(level);
    linesEl.textContent = String(lines);
  };

  const resetGame = () => {
    board = emptyBoard();
    nextKind = null;
    score = 0;
    lines = 0;
    level = 1;
    running = false;
    over = false;
    flash = null;
    acc = 0;
    softKey = false;
    softHeld = false;
    softUntil = 0;
    spawnPiece();
    syncHud();
  };

  // next piece enters at the top; a collision here means the stack reached
  // the ceiling → game over
  const spawnPiece = () => {
    const kind = nextKind ?? randomKind();
    nextKind = randomKind();
    const shape = SHAPES[kind];
    cur = { kind, cells: shape.cells.map((c) => [...c]), x: shape.spawnX, y: 0 };
    drawNext();
    if (collides(board, absCells(cur))) return gameOver();
  };

  const move = (dx) => {
    if (!running || over || flash || !cur) return false;
    const shifted = cellsAt(cur.x + dx, cur.y, cur.cells);
    if (collides(board, shifted)) return false;
    cur.x += dx;
    moveSfx();
    return true;
  };

  const rotate = () => {
    if (!running || over || flash || !cur) return;
    const shape = SHAPES[cur.kind];
    const kicked = tryRotate(shape, cur.cells, cur.x, cur.y, board);
    if (kicked) {
      cur.cells = kicked.cells;
      cur.x = kicked.x;
      rotateSfx();
    }
  };

  const canDescend = (p) =>
    !collides(board, cellsAt(p.x, p.y + 1, p.cells));

  // one gravity tick: descend, or lock into the stack
  const gravityStep = (soft) => {
    if (!cur || over || flash) return;
    if (canDescend(cur)) {
      cur.y++;
      if (soft) {
        score += SOFT_PTS;
        scoreEl.textContent = String(score);
      }
    } else {
      lock();
    }
  };

  // stamp the current piece into the board, detect full rows, flash them
  const lock = () => {
    for (const [x, y] of absCells(cur)) board[y][x] = cur.kind;
    lockSfx();
    cur = null;
    const rows = fullRows(board);
    if (rows.length) {
      flash = { rows, until: now() + FLASH_MS };
      clearSfx();
    } else {
      spawnPiece();
    }
  };

  // flash elapsed: collapse the cleared rows, bank score/lines/level, spawn
  const finishFlash = () => {
    const rows = flash.rows;
    const n = rows.length;
    board = collapseRows(board, rows);
    lines += n;
    score += lineScore(n, level);
    level = levelFor(lines);
    flash = null;
    cur = null;
    syncHud();
    spawnPiece();
  };

  const hardDrop = () => {
    if (!running || over || flash || !cur) return;
    let n = 0;
    while (canDescend(cur)) { cur.y++; n++; }
    score += n * HARD_PTS;
    scoreEl.textContent = String(score);
    dropSfx();
    lock();
  };

  // ── rendering ────────────────────────────────────────────────────────
  const ink = () => (root.dataset.theme === "dark" ? "#ffffff" : "#000000");
  const paper = () => (root.dataset.theme === "dark" ? "#000000" : "#ffffff");
  const soft = () => (root.dataset.theme === "dark" ? "#1c1c1c" : "#f2f2f2");

  let sigCache = null;
  let sigTheme = null;
  const sigColor = (kind) => {
    if (sigTheme !== root.dataset.theme) {
      sigTheme = root.dataset.theme;
      sigCache = {};
      for (const k of Object.keys(SIG)) {
        const s = SIG[k];
        sigCache[k] = s.token
          ? (getComputedStyle(root).getPropertyValue(s.token).trim() || s.hex)
          : s.value;
      }
    }
    return sigCache[kind];
  };

  // flat fill + 2px ink border, all inside the cell (integer coords)
  const drawBlock = (c, px, py, size, color) => {
    const b = 2;
    c.fillStyle = color;
    c.fillRect(px, py, size, size);
    c.fillStyle = ink();
    c.fillRect(px, py, size, b);
    c.fillRect(px, py + size - b, size, b);
    c.fillRect(px, py, b, size);
    c.fillRect(px + size - b, py, b, size);
  };

  const NEXT_CELL = 24; // preview cell size (canvas is 96x48)

  const drawNext = () => {
    nextCtx.fillStyle = paper();
    nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
    if (!nextKind) return;
    const shape = SHAPES[nextKind];
    const cells = shape.cells;
    const minX = Math.min(...cells.map((c) => c[0]));
    const maxX = Math.max(...cells.map((c) => c[0]));
    const minY = Math.min(...cells.map((c) => c[1]));
    const maxY = Math.max(...cells.map((c) => c[1]));
    const offX = Math.round((nextCanvas.width - (maxX - minX + 1) * NEXT_CELL) / 2) - minX * NEXT_CELL;
    const offY = Math.round((nextCanvas.height - (maxY - minY + 1) * NEXT_CELL) / 2) - minY * NEXT_CELL;
    const color = sigColor(nextKind);
    for (const [cx, cy] of cells) {
      drawBlock(nextCtx, offX + cx * NEXT_CELL, offY + cy * NEXT_CELL, NEXT_CELL, color);
    }
  };

  const draw = () => {
    ctx.fillStyle = paper();
    ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);

    // grid lines
    ctx.fillStyle = soft();
    for (let i = 1; i < COLS; i++) ctx.fillRect(i * CELL - 1, 0, 2, ROWS * CELL);
    for (let j = 1; j < ROWS; j++) ctx.fillRect(0, j * CELL - 1, COLS * CELL, 2);

    // locked stack
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const kind = board[y][x];
        if (kind) drawBlock(ctx, x * CELL, y * CELL, CELL, sigColor(kind));
      }
    }

    // line-clear flash: full rows go solid ink for FLASH_MS
    if (flash) {
      ctx.fillStyle = ink();
      for (const y of flash.rows) ctx.fillRect(0, y * CELL, COLS * CELL, CELL);
    }

    // falling piece
    if (cur && !over) {
      const color = sigColor(cur.kind);
      for (const [x, y] of absCells(cur)) {
        drawBlock(ctx, x * CELL, y * CELL, CELL, color);
      }
    }
  };

  // ── game loop ────────────────────────────────────────────────────────
  const frame = (t) => {
    if (running && !over) {
      if (flash) {
        if (t >= flash.until) finishFlash();
      } else {
        acc += Math.min(t - (frame.lastT ?? t), 100);
        let interval = intervalMs();
        while (acc >= interval && !over && !flash) {
          acc -= interval;
          gravityStep(isSoft());
          interval = intervalMs();
        }
      }
    }
    frame.lastT = t;
    draw();
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

  const gameOver = () => {
    running = false;
    over = true;
    dieSfx();
    if (score > best) {
      best = score;
      localStorage.setItem("tetris_best", String(best));
      bestEl.textContent = `BEST ${best}`;
    }
    overlayTitle.innerHTML = "GAME<br>OVER";
    overlaySub.textContent = "TAP / SPACE TO RETRY";
    overlayScore.hidden = false;
    overlayScore.innerHTML = `SCORE ${score} · LINES ${lines} · LEVEL ${level}<br>BEST ${best}`;
    overlayHint.hidden = true;
    overlay.style.display = "";
  };

  // ── input: keyboard ──────────────────────────────────────────────────
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "Enter") {
      e.preventDefault();
      if (isOverlayVisible()) start();
      else if (e.code === "Space") hardDrop();
      return;
    }
    if (isOverlayVisible()) { start(); return; }
    switch (e.code) {
      case "ArrowLeft": e.preventDefault(); move(-1); break;
      case "ArrowRight": e.preventDefault(); move(1); break;
      case "ArrowDown": e.preventDefault(); softKey = true; break;
      case "ArrowUp": e.preventDefault(); rotate(); break;
    }
  });

  document.addEventListener("keyup", (e) => {
    if (e.code === "ArrowDown") softKey = false;
  });

  // ── input: canvas gestures — tap = rotate, swipe down = soft drop ────
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
    if (isOverlayVisible()) { start(); return; }
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) { rotate(); return; } // tap
    if (dy > 0 && Math.abs(dy) >= Math.abs(dx)) {
      softUntil = now() + 600; // swipe down: 5x-speed burst
    }
  });
  canvas.addEventListener("pointercancel", () => { swipe = null; });

  // ── input: on-screen button row ──────────────────────────────────────
  const holdRepeat = (el, fn, delay = 300, repeat = 90) => {
    let t1 = null, t2 = null;
    const stop = () => { clearTimeout(t1); clearInterval(t2); t1 = t2 = null; };
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      fn();
      t1 = setTimeout(() => { t2 = setInterval(fn, repeat); }, delay);
    });
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) {
      el.addEventListener(ev, stop);
    }
  };

  holdRepeat(document.getElementById("btnLeft"), () => move(-1));
  holdRepeat(document.getElementById("btnRight"), () => move(1));

  const btnDown = document.getElementById("btnDown");
  btnDown.addEventListener("pointerdown", (e) => { e.preventDefault(); softHeld = true; });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) {
    btnDown.addEventListener(ev, () => { softHeld = false; });
  }

  document.getElementById("btnRot").addEventListener("click", rotate);
  document.getElementById("btnDrop").addEventListener("click", hardDrop);

  startBtn.addEventListener("click", start);
  // tap anywhere on the instructions panel = start (touch-first)
  overlayPanel.addEventListener("click", (e) => {
    if (e.target === startBtn) return;
    start();
  });

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
