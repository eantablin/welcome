// =====================================================================
// 2048 — brutalist. White paper, black ink, hard borders.
// Vanilla DOM grid, no canvas. Arrow keys + swipe.
// WebAudio synthesized SFX (no files). Best score in localStorage.
// Pure game core runs the rules; DOM wiring renders it.
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

  const slideSfx = () => beep(320, 0.05, "square", 0.05);
  const mergeSfx = () => { beep(520, 0.06); setTimeout(() => beep(780, 0.07), 60); };
  const winSfx = () => { beep(660, 0.08); setTimeout(() => beep(990, 0.12), 90); };
  const loseSfx = () => beep(140, 0.25, "sawtooth", 0.1);

  // ── pure game core (shared with smoke test) ───────────────────────────
  const SIZE = 4;

  // Move one row (array of 4 numbers, left = index 0) left.
  // Returns { row, gained, merged } — merged[i] is a COPY so equal
  // neighbors don't chain: [2,2,4,4] → [4,8,0,0], gained = 12.
  const moveRowLeft = (row) => {
    const tiles = row.filter((v) => v !== 0);
    const out = [];
    const merged = [];
    let gained = 0;
    for (let i = 0; i < tiles.length; i++) {
      if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
        const mergedVal = tiles[i] * 2;
        out.push(mergedVal);
        merged.push(true);
        gained += mergedVal;
        i++; // consume the pair
      } else {
        out.push(tiles[i]);
        merged.push(false);
      }
    }
    while (out.length < row.length) { out.push(0); merged.push(false); }
    return { row: out, gained, merged };
  };

  // Move the whole 4x4 board in one direction.
  // dir: "left" | "right" | "up" | "down"
  // Returns { board, gained, moved, hit2048 }
  const moveBoard = (board, dir) => {
    const grid = board.map((r) => r.slice());
    let gained = 0;
    let hit = false;
    for (let i = 0; i < SIZE; i++) {
      let line;
      if (dir === "left" || dir === "right") line = grid[i].slice();
      else line = [grid[0][i], grid[1][i], grid[2][i], grid[3][i]];

      const L = dir === "left" || dir === "up";
      if (!L) line.reverse();

      const { row, gained: g, merged } = moveRowLeft(line);
      gained += g;
      if (merged.some((m, idx) => m && row[idx] >= 2048)) hit = true;
      if (!L) row.reverse();

      if (dir === "left" || dir === "right") grid[i] = row;
      else for (let k = 0; k < SIZE; k++) grid[k][i] = row[k];
    }
    const moved = JSON.stringify(grid) !== JSON.stringify(board);
    return { board: grid, gained, moved, hit2048: hit };
  };

  // Empty coordinates
  const empties = (board) => {
    const out = [];
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++)
        if (board[y][x] === 0) out.push({ x, y });
    return out;
  };

  // Spawn a 2 (90%) or 4 (10%) in a random empty cell (mutates board).
  const spawn = (board, rand = Math.random) => {
    const open = empties(board);
    if (open.length === 0) return null;
    const spot = open[Math.floor(rand() * open.length)];
    const value = rand() < 0.9 ? 2 : 4;
    board[spot.y][spot.x] = value;
    return { ...spot, value };
  };

  // Game over: no empty cell AND no adjacent equal pair.
  const gameOver = (board) => {
    if (empties(board).length > 0) return false;
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        if (x + 1 < SIZE && board[y][x] === board[y][x + 1]) return false;
        if (y + 1 < SIZE && board[y][x] === board[y + 1][x]) return false;
      }
    return true;
  };

  // ── DOM wiring ───────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const boardEl = $("board");
  const scoreEl = $("score");
  const bestEl = $("best");
  const overlay = $("overlay");
  const overlayTitle = $("overlayTitle");
  const overlaySub = $("overlaySub");
  const overlayScore = $("overlayScore");
  const installHint = $("installHint");
  const hintEl = $("hint");
  const startBtn = $("startBtn");
  const continueBtn = $("continueBtn");
  const soundBtn = $("soundBtn");

  let board, score, best, over, won, keepGoing, busy;
  best = Number(localStorage.getItem("2048_best") ?? 0);
  bestEl.textContent = `BEST ${best}`;

  const emptyBoard = () => Array.from({ length: SIZE }, () => Array(SIZE).fill(0));

  const resetGame = () => {
    board = emptyBoard();
    score = 0;
    over = false;
    won = false;
    keepGoing = false;
    busy = false;
    scoreEl.textContent = "0";
    spawn(board);
    spawn(board);
    render();
  };

  // style a tile: bigger numbers → slightly lighter ink (opacity ladder)
  const tileOpacity = (v) => {
    const ladder = { 2: 0.92, 4: 0.84, 8: 0.76, 16: 0.68, 32: 0.66, 64: 0.58, 128: 0.5, 256: 0.44, 512: 0.36, 1024: 0.28, 2048: 0.2, 4096: 0.14, 8192: 0.14 };
    return ladder[v] ?? 0.14;
  };

  const render = () => {
    boardEl.textContent = "";
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        const v = board[y][x];
        const cell = document.createElement("div");
        if (v === 0) {
          cell.className = "cell cell--empty";
        } else {
          cell.className = "cell tile";
          cell.dataset.v = String(v);
          cell.style.opacity = String(tileOpacity(v));
          const n = document.createElement("span");
          n.className = "tile__n" + (v >= 128 ? " tile__n--long" : "");
          n.textContent = String(v);
          cell.appendChild(n);
        }
        boardEl.appendChild(cell);
      }
    hintEl.textContent = `MERGE EQUAL TILES · REACH 2048 · ${empties(board).length} FREE`;
  };

  const showOverlay = (title, sub, scoreText, showContinue) => {
    overlayTitle.innerHTML = title;
    overlaySub.textContent = sub;
    overlayScore.hidden = !scoreText;
    overlayScore.textContent = scoreText ?? "";
    continueBtn.hidden = !showContinue;
    installHint.hidden = over && !won;
    overlay.style.display = "";
  };

  const hideOverlay = () => { overlay.style.display = "none"; };

  const start = () => {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ }
    }
    audioCtx?.resume?.();
    overlay.style.display = "none";
    resetGame();
  };

  const continueGame = () => {
    if (!won) return;
    keepGoing = true;
    over = false;
    overlay.style.display = "none";
  };

  const finishMove = (res) => {
    score += res.gained;
    scoreEl.textContent = String(score);
    if (score > best) {
      best = score;
      localStorage.setItem("2048_best", String(best));
      bestEl.textContent = `BEST ${best}`;
    }
    render();
    mergeSfx();

    if (res.hit2048 && !won) {
      won = true;
      winSfx();
      showOverlay("2048!", "YOU MADE THE 2048 TILE", `SCORE ${score} · BEST ${best}`, true);
      return;
    }
    if (gameOver(board)) {
      over = true;
      loseSfx();
      showOverlay("GAME<br>OVER", "NO MOVES LEFT", `SCORE ${score} · BEST ${best}`, false);
    }
  };

  const doMove = (dir) => {
    if (over || busy) return;
    if (overlay.style.display !== "none" && !keepGoing) return;
    busy = true;
    const res = moveBoard(board, dir);
    if (res.moved) {
      board = res.board;
      spawn(board);
      finishMove(res);
      slideSfx();
    }
    busy = false;
  };

  // ── input: keyboard ──────────────────────────────────────────────────
  document.addEventListener("keydown", (e) => {
    const keys = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
    const dir = keys[e.key];
    if (dir) { e.preventDefault(); doMove(dir); }
  });

  // ── input: swipe ─────────────────────────────────────────────────────
  let touchStart = null;
  boardEl.addEventListener("pointerdown", (e) => {
    touchStart = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  });
  boardEl.addEventListener("pointerup", (e) => {
    if (!touchStart) return;
    const dx = e.clientX - touchStart.x;
    const dy = e.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return; // tap: no move
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    doMove(dir);
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

  startBtn.addEventListener("click", start);
  continueBtn.addEventListener("click", continueGame);

  // ── boot ─────────────────────────────────────────────────────────────
  overlay.style.display = "";
  registerSW();
})();

// ── service worker (kept outside the IIFE so failures don't kill the game) ──
function registerSW() {
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => { /* offline cache unavailable */ });
  }
}
