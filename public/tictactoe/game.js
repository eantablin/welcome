// =====================================================================
// BRUTAL TIC-TAC-TOE — brutalist.
// You are X. The AI is O and plays perfect minimax — it cannot lose.
// Win/loss/draw record persisted in localStorage. WebAudio synth SFX.
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

  const placeSfx = () => beep(520, 0.05, "square", 0.05);
  const winSfx = () => { beep(660, 0.08); setTimeout(() => beep(990, 0.12), 90); };
  const loseSfx = () => beep(140, 0.25, "sawtooth", 0.1);
  const drawSfx = () => beep(440, 0.1, "triangle", 0.06);

  const unlockAudio = () => {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ }
    }
    audioCtx?.resume?.();
  };

  // ── game core (pure functions — testable without DOM) ────────────────
  const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];

  const winner = (board) => {
    for (const [a, b, c] of LINES) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return { player: board[a], line: [a, b, c] };
      }
    }
    return null;
  };

  const moves = (board) => board.map((v, i) => (v ? null : i)).filter((v) => v !== null);

  // minimax: O (AI) minimizes, X maximizes. Returns best score for `turn`.
  const minimax = (board, turn, depth = 0) => {
    const w = winner(board);
    if (w) return w.player === "X" ? 10 - depth : depth - 10;
    const open = moves(board);
    if (open.length === 0) return 0;

    if (turn === "O") {
      let best = Infinity;
      for (const m of open) {
        board[m] = "O";
        best = Math.min(best, minimax(board, "X", depth + 1));
        board[m] = "";
      }
      return best;
    }
    let best = -Infinity;
    for (const m of open) {
      board[m] = "X";
      best = Math.max(best, minimax(board, "O", depth + 1));
      board[m] = "";
    }
    return best;
  };

  const bestMove = (board) => {
    const open = moves(board);
    let best = Infinity, choice = open[0];
    for (const m of open) {
      board[m] = "O";
      const score = minimax(board, "X", 1);
      board[m] = "";
      if (score < best) { best = score; choice = m; }
    }
    return choice;
  };

  // ── DOM wiring ───────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const cells = [...document.querySelectorAll(".cell")];
  const recordEl = $("record");
  const msgEl = $("msg");

  let board, over, record;

  const loadRecord = () => {
    try { record = JSON.parse(localStorage.getItem("brutalttt_record") ?? "") ?? { w: 0, l: 0, d: 0 }; }
    catch { record = { w: 0, l: 0, d: 0 }; }
    if (typeof record.w !== "number") record = { w: 0, l: 0, d: 0 };
  };

  const syncRecord = () => {
    recordEl.innerHTML = `W${record.w}&nbsp;L${record.l}&nbsp;D${record.d}`;
    localStorage.setItem("brutalttt_record", JSON.stringify(record));
  };

  const newGame = () => {
    board = Array(9).fill("");
    over = false;
    cells.forEach((c) => { c.textContent = ""; c.disabled = false; c.classList.remove("cell--win"); });
    msgEl.textContent = "YOU ARE X — TAP A CELL";
  };

  const finish = (result) => {
    over = true;
    cells.forEach((c) => (c.disabled = true));
    if (result.line) result.line.forEach((i) => cells[i].classList.add("cell--win"));
    if (result.player === "X") { record.w++; winSfx(); msgEl.textContent = "YOU WIN. IMPOSSIBLE — CHEATING?"; }
    else if (result.player === "O") { record.l++; loseSfx(); msgEl.textContent = "AI WINS. AS DESIGNED."; }
    else { record.d++; drawSfx(); msgEl.textContent = "DRAW. RESPECTABLE."; }
    syncRecord();
  };

  const playerMove = (i) => {
    if (over || board[i]) return;
    unlockAudio();
    board[i] = "X";
    cells[i].textContent = "X";
    cells[i].disabled = true;
    placeSfx();

    let w = winner(board);
    if (w) return finish(w);
    if (moves(board).length === 0) return finish({ player: null });

    // AI move after a short beat
    setTimeout(() => {
      if (over) return;
      const m = bestMove(board);
      board[m] = "O";
      cells[m].textContent = "O";
      cells[m].disabled = true;
      placeSfx();

      w = winner(board);
      if (w) return finish(w);
      if (moves(board).length === 0) return finish({ player: null });
      msgEl.textContent = "YOUR MOVE";
    }, 260);
  };

  cells.forEach((c) => c.addEventListener("click", () => playerMove(Number(c.dataset.i))));
  $("newBtn").addEventListener("click", () => { unlockAudio(); newGame(); });
  $("resetBtn").addEventListener("click", () => { record = { w: 0, l: 0, d: 0 }; syncRecord(); });

  $("soundBtn").addEventListener("click", (e) => {
    soundOn = !soundOn;
    unlockAudio();
    e.currentTarget.setAttribute("aria-pressed", String(soundOn));
    e.currentTarget.textContent = `SOUND: ${soundOn ? "ON" : "OFF"}`;
  });

  // keyboard 1-9 map to cells
  document.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    const n = Number(e.key);
    if (n >= 1 && n <= 9) playerMove(n - 1);
  });

  // ── boot ─────────────────────────────────────────────────────────────
  loadRecord();
  syncRecord();
  newGame();
  registerSW();
})();

function registerSW() {
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => { /* offline cache unavailable */ });
  }
}
