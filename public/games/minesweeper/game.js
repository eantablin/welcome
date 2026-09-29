// =====================================================================
// MINESWEEPER — brutalist black/white. 9x9 grid, 10 mines.
// First click always safe (mines placed after first reveal, excluding
// that cell + its neighbors). Flag mode toggle for mobile; right-click
// flags on desktop. Timer + mine counter in HUD. Best time persisted.
// WebAudio synth SFX. No assets, no libraries.
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

  const revealSfx = () => beep(520, 0.05, "square", 0.05);
  const floodSfx = () => { beep(480, 0.04); setTimeout(() => beep(640, 0.06), 60); };
  const flagSfx = () => beep(880, 0.06, "triangle", 0.07);
  const loseSfx = () => beep(140, 0.3, "sawtooth", 0.1);
  const winSfx = () => { beep(660, 0.08); setTimeout(() => beep(990, 0.12), 90); };

  const unlockAudio = () => {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ }
    }
    audioCtx?.resume?.();
  };

  // ═══════════════════════════════════════════════════════════════════
  // PURE GAME CORE (smoke-tested via scripts/smoke-minesweeper.mjs)
  // ═══════════════════════════════════════════════════════════════════

  // Create a fresh board. Cells: { mine:false, adj:0, revealed:false, flag:false }
  const createBoard = (rows, cols) => {
    const cells = [];
    for (let r = 0; r < rows; r++) {
      cells.push(Array.from({ length: cols }, () => ({
        mine: false, adj: 0, revealed: false, flag: false,
      })));
    }
    return cells;
  };

  // Place mines, excluding (sr,sc) and all its neighbors. Sets adjacency counts.
  const placeMines = (board, count, sr, sc) => {
    const rows = board.length, cols = board[0].length;
    const safe = new Set();
    safe.add((sr << 8) | sc);
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const r = sr + dr, c = sc + dc;
        if (r >= 0 && r < rows && c >= 0 && c < cols) safe.add((r << 8) | c);
      }
    const pool = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (!safe.has((r << 8) | c)) pool.push((r << 8) | c);

    // Fisher–Yates partial shuffle over the pool
    const need = Math.min(count, pool.length);
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(Math.random() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    for (let i = 0; i < need; i++) {
      const key = pool[i];
      board[key >> 8][key & 255].mine = true;
    }

    // adjacency counts
    for (let r = 0; r < rows; r++) {
      const row = board[r];
      for (let c = 0; c < cols; c++) {
        let n = 0;
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const rr = r + dr, cc = c + dc;
            if (rr >= 0 && rr < rows && cc >= 0 && cc < cols && board[rr][cc].mine) n++;
          }
        row[c].adj = n;
      }
    }
    return board;
  };

  // Flood-fill reveal from (r,c). Mutates board; returns set of keys revealed
  // this call (including the clicked cell). Obeys flags — a flagged cell is
  // never auto-revealed by the flood.
  const revealCell = (board, r0, c0) => {
    const rows = board.length, cols = board[0].length;
    const revealedNow = new Set();
    const start = board[r0][c0];
    if (start.revealed || start.flag) return revealedNow;
    const stack = [[r0, c0]];
    while (stack.length) {
      const [r, c] = stack.pop();
      const cell = board[r][c];
      if (cell.revealed || cell.flag) continue;
      cell.revealed = true;
      revealedNow.add((r << 8) | c);
      if (cell.adj !== 0) continue;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const rr = r + dr, cc = c + dc;
          if (rr >= 0 && rr < rows && cc >= 0 && cc < cols && !board[rr][cc].flag) {
            if (!board[rr][cc].revealed) stack.push([rr, cc]);
          }
        }
    }
    return revealedNow;
  };

  // Toggle a flag. Returns the new flag state; no-op on revealed cells.
  const toggleFlag = (board, r, c) => {
    const cell = board[r][c];
    if (cell.revealed) return cell.flag;
    cell.flag = !cell.flag;
    return cell.flag;
  };

  // Lose: any revealed cell is a mine. Win: all non-mine cells revealed.
  const isLost = (board) =>
    board.some((row) => row.some((cell) => cell.revealed && cell.mine));
  const isWon = (board) => {
    let hiddenSafe = 0;
    for (const row of board)
      for (const cell of row)
        if (!cell.mine && !cell.revealed) hiddenSafe++;
    return !isLost(board) && hiddenSafe === 0;
  };

  // Revealed mines lose count (for HUD when the game ends: count of
  // mistakes, or remaining flags). Not used by smoke — helper only.
  const flaggedCount = (board) => {
    let n = 0;
    for (const row of board) for (const cell of row) if (cell.flag) n++;
    return n;
  };

  globalThis.MinesweeperCore = {
    createBoard, placeMines, revealCell, toggleFlag, isLost, isWon, flaggedCount,
  };

  // ═══════════════════════════════════════════════════════════════════
  // END PURE CORE
  // ═══════════════════════════════════════════════════════════════════

  // ── DOM ──────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const els = {
    mines: $("mines"), time: $("time"), status: $("status"), best: $("best"),
    board: $("board"), flagMode: $("flagMode"),
    overlay: $("overlay"), overlayPanel: $("overlay").querySelector(".overlay__panel"),
    overlayTitle: $("overlayTitle"), overlaySub: $("overlaySub"),
    overlayScore: $("overlayScore"),
    newBtn: $("newBtn"), startBtn: $("startBtn"), soundBtn: $("soundBtn"),
  };

  // boot overlay is visible until the first game starts
  els.overlay.hidden = false;

  const ROWS = 9, COLS = 9, MINES = 10;

  // ── state ────────────────────────────────────────────────────────────
  let board = createBoard(ROWS, COLS);
  let phase = "idle";    // idle | play | lost | won
  let flagMode = false;
  let flagCount = 0;
  let startTime = 0;
  let elapsed = 0;
  let best = Number(localStorage.getItem("minesweeper_best_ms") ?? 0);
  let curR = 0, curC = 0;   // keyboard focus cell

  const fmtTime = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };

  // ── HUD ──────────────────────────────────────────────────────────────
  const syncHud = () => {
    els.mines.textContent = String(MINES - flagCount).padStart(2, "0");
    els.time.textContent = fmtTime(elapsed);
    els.status.textContent =
      phase === "lost" ? "BOOM" : phase === "won" ? "CLEAR" : "PLAY";
    els.best.textContent = best ? `BEST ${fmtTime(best)}` : "BEST —";
    els.flagMode.setAttribute("aria-pressed", String(flagMode));
    els.flagMode.classList.toggle("tool--on", flagMode);
    els.flagMode.textContent = `FLAG MODE: ${flagMode ? "ON" : "OFF"}`;
  };

  // ── timer ────────────────────────────────────────────────────────────
  const tick = () => {
    if (phase !== "play") return;
    elapsed = Date.now() - startTime;
    els.time.textContent = fmtTime(elapsed);
  };
  setInterval(tick, 250);

  const startTimer = () => {
    startTime = Date.now();
    elapsed = 0;
    phase = "play";
    els.time.textContent = "00:00";
  };

  const stopTimer = (finalElapsedMs) => {
    elapsed = finalElapsedMs ?? (Date.now() - startTime);
    els.time.textContent = fmtTime(elapsed);
  };

  // ── board rendering ─────────────────────────────────────────────────
  const cellBtns = [];

  const buildBoard = () => {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const btn = document.createElement("button");
        btn.className = "cell";
        btn.type = "button";
        btn.dataset.r = r;
        btn.dataset.c = c;
        btn.setAttribute("data-cell", "");
        btn.addEventListener("click", () => onCellClick(r, c, btn));
        btn.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          unlockAudio();
          doFlag(r, c);
        });
        els.board.appendChild(btn);
        cellBtns.push(btn);
      }
    }
  };

  const syncBoard = () => {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = board[r][c];
        const btn = cellBtns[r * COLS + c];
        btn.className =
          "cell" +
          (r === curR && c === curC ? " cell--cursor" : "") +
          (cell.revealed ? " cell--open" : "") +
          (!cell.revealed && cell.flag ? " cell--flag" : "") +
          (cell.revealed && cell.mine ? " cell--mine" : "");
        if (cell.revealed) {
          if (cell.mine) {
            btn.textContent = "●";
            btn.classList.add("n-0");
          } else if (cell.adj > 0) {
            btn.textContent = String(cell.adj);
            btn.classList.add(`n-${cell.adj}`);
          } else {
            btn.textContent = "";
          }
        } else {
          btn.textContent = cell.flag ? "⚑" : "";
        }
      }
    }
    syncHud();
  };

  // ── reveal all mines on loss; also show wrong flags ───────────────────
  const revealMines = () => {
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const cell = board[r][c];
        const btn = cellBtns[r * COLS + c];
        if (cell.mine && !cell.revealed) {
          cell.revealed = true;
          btn.classList.add("cell--open", "cell--mine");
          btn.textContent = "●";
        }
        if (!cell.mine && cell.flag) {
          btn.classList.remove("cell--flag");
          btn.classList.add("cell--wrong");
          btn.textContent = "×";
        }
      }
  };

  // ── actions ─────────────────────────────────────────────────────────
  const doFlag = (r, c) => {
    if (phase === "lost" || phase === "won") return;
    const cell = board[r][c];
    if (cell.revealed) return;
    const now = toggleFlag(board, r, c);
    flagCount += now ? 1 : -1;
    flagSfx();
    syncBoard();
  };

  const onCellClick = (r, c, btn) => {
    if (phase === "lost" || phase === "won") return;
    unlockAudio();
    if (flagMode) { doFlag(r, c); return; }

    if (phase === "idle") {
      placeMines(board, MINES, r, c);
      startTimer();
      els.overlay.hidden = true;
      els.startBtn.textContent = "NEW SWEEP";
    }

    const cell = board[r][c];
    if (cell.flag) return; // can't reveal a flagged cell
    if (cell.revealed && cell.adj > 0) return; // already open

    const wasSafe = !cell.mine;
    const count = revealCell(board, r, c);
    if (wasSafe) {
      if (count.size > 1) floodSfx(); else revealSfx();
    } else {
      // clicked mine: show it and lose
      syncBoard();
      phase = "lost";
      stopTimer();
      revealMines();
      loseSfx();
      els.overlayTitle.innerHTML = "BOOM";
      els.overlaySub.textContent = "YOU HIT A MINE.";
      els.overlayScore.hidden = false;
      els.overlayScore.textContent = `TIME ${fmtTime(elapsed)} — BEST ${best ? fmtTime(best) : "—"}`;
      els.overlay.hidden = false;
      els.startBtn.textContent = "NEW SWEEP";
      return;
    }

    if (isWon(board)) {
      phase = "won";
      stopTimer();
      winSfx();
      if (!best || elapsed < best) {
        best = elapsed;
        localStorage.setItem("minesweeper_best_ms", String(best));
      }
      // mark all remaining mines as flagged on win
      for (const row of board) for (const mc of row) if (mc.mine) mc.flag = true;
      flagCount = MINES; // counter reads 00 — every mine accounted for
      els.overlayTitle.innerHTML = "CLEAR";
      els.overlaySub.textContent = "FIELD SWEPT WITHOUT LOSS.";
      els.overlayScore.hidden = false;
      els.overlayScore.textContent = `TIME ${fmtTime(elapsed)} — BEST ${fmtTime(best)}`;
      els.overlay.hidden = false;
      els.startBtn.textContent = "NEW SWEEP";
    }
    syncBoard();
  };

  const startGame = () => {
    board = createBoard(ROWS, COLS);
    phase = "idle";
    flagCount = 0;
    elapsed = 0;
    curR = 0; curC = 0;
    els.time.textContent = "00:00";
    els.overlay.hidden = true;
    els.startBtn.textContent = "NEW SWEEP";
    for (const btn of cellBtns) { btn.className = "cell"; btn.textContent = ""; }
    cellBtns[0].classList.add("cell--cursor");
    syncHud();
  };

  // ── events ───────────────────────────────────────────────────────────
  els.flagMode.addEventListener("click", () => {
    unlockAudio();
    flagMode = !flagMode;
    beep(700, 0.05);
    syncHud();
  });
  els.newBtn.addEventListener("click", () => { unlockAudio(); startGame(); });
  els.startBtn.addEventListener("click", () => { unlockAudio(); startGame(); });
  // tap anywhere on the instructions panel = start (touch-first)
  els.overlayPanel.addEventListener("click", (e) => {
    if (e.target === els.startBtn) return;
    unlockAudio();
    startGame();
  });
  els.soundBtn.addEventListener("click", () => {
    unlockAudio();
    soundOn = !soundOn;
    els.soundBtn.textContent = `SOUND: ${soundOn ? "ON" : "OFF"}`;
    els.soundBtn.setAttribute("aria-pressed", String(soundOn));
    if (soundOn) beep(880, 0.05);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "f" || e.key === "F") {
      flagMode = !flagMode;
      syncHud();
      return;
    }
    if (phase === "lost" || phase === "won") return;
    const cellBtn = cellBtns[curR * COLS + curC];
    let moved = false;
    if (e.key === "ArrowUp" && curR > 0) { curR--; moved = true; }
    else if (e.key === "ArrowDown" && curR < ROWS - 1) { curR++; moved = true; }
    else if (e.key === "ArrowLeft" && curC > 0) { curC--; moved = true; }
    else if (e.key === "ArrowRight" && curC < COLS - 1) { curC++; moved = true; }
    else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      cellBtns[curR * COLS + curC].click();
      return;
    }
    if (moved) {
      cellBtn.classList.remove("cell--cursor");
      cellBtns[curR * COLS + curC].classList.add("cell--cursor");
    }
  });

  // ── boot ─────────────────────────────────────────────────────────────
  buildBoard();
  cellBtns[0].classList.add("cell--cursor");
  syncHud();
})();
