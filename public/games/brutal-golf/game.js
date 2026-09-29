// =====================================================================
// BRUTAL GOLF — top-down mini-golf, brutalist black/white.
// 9 hand-built holes from ASCII level strings on a 32px grid.
// Physics: press/drag from the ball → launch vector; friction decays
// velocity each frame; walls reflect exactly one axis; the hole captures
// a ball that is near AND slow. No assets: everything drawn with rects.
// WebAudio synthesized SFX (no files). Best total in localStorage.
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

  const puttSfx = (power) => beep(320 + 400 * power, 0.06, "square", 0.05 + 0.06 * power);
  const sinkSfx = () => { beep(660, 0.08); setTimeout(() => beep(990, 0.12), 90); };
  const winSfx = () => { beep(660, 0.08); setTimeout(() => beep(880, 0.08), 90); setTimeout(() => beep(1320, 0.2), 180); };

  const unlockAudio = () => {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ }
    }
    audioCtx?.resume?.();
  };

  // ═══════════════════════════════════════════════════════════════════
  // PURE GAME CORE (smoke-tested via scripts/smoke-golf.mjs)
  // ═══════════════════════════════════════════════════════════════════

  const GRID = 32;             // wall block size, px
  const FRICTION = 0.985;      // velocity multiplier per 60fps frame
  const STOP_SPEED = 2.2;      // px/frame — below this the ball stops
  const BALL_R = 7;            // ball half-size (square ball)
  const HOLE_R = 12;           // capture radius
  const CAPTURE_SPEED = 5.5;   // px/frame — must be slower than this to drop
  const MAX_DRAG = 130;        // drag length (px) mapping to full power
  const MAX_POWER = 15;        // px/frame launch speed at full power

  // 9 holes as ASCII level strings (15 cols × 20 rows → 480×640).
  // "#" wall (32px block), "." floor, "B" ball start, "O" hole,
  // digits = the hole's par (digit cells play as floor).
  const HOLES = [
    // 1 — par 2: open room, straight-ish putt
    [
      "###############",
      "#2............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#B...........O#",
      "###############",
    ],
    // 2 — par 2: split by a center pillar
    [
      "###############",
      "#2............#",
      "#.B...........#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#....###......#",
      "#....###......#",
      "#....###......#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#............O#",
      "###############",
    ],
    // 3 — par 3: three full walls, alternating gates
    [
      "###############",
      "#3............#",
      "#.B...........#",
      "#.............#",
      "#.............#",
      "######....#####",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "####....#######",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "########......#",
      "#.............#",
      "#.............#",
      "#............O#",
      "###############",
    ],
    // 4 — par 3: L corridor around an inner wall
    [
      "###############",
      "#3............#",
      "#.B...........#",
      "#.............#",
      "#.............#",
      "#....######...#",
      "#....#........#",
      "#....#........#",
      "#....#........#",
      "#....#........#",
      "#....#........#",
      "#....#........#",
      "#....#........#",
      "#....#........#",
      "#....#........#",
      "#....#........#",
      "#....#........#",
      "#....#........#",
      "#....B.......O#",
      "###############",
    ],
    // 5 — par 3: two barriers, staggered gaps
    [
      "###############",
      "#3............#",
      "#..B..........#",
      "#....#....#...#",
      "#....#....#...#",
      "#....#....#...#",
      "#....#....#...#",
      "#....#....#...#",
      "#.........#...#",
      "#.........#...#",
      "#....#....#...#",
      "#....#....#...#",
      "#....#....#...#",
      "#....#....#...#",
      "#....#........#",
      "#....#......O.#",
      "#....#....#...#",
      "#....#....#...#",
      "#....#....#...#",
      "###############",
    ],
    // 6 — par 3: pinball pillars
    [
      "###############",
      "#3............#",
      "#.............#",
      "#.............#",
      "#..###........#",
      "#..###........#",
      "#.............#",
      "#.............#",
      "#.........###.#",
      "#.........###.#",
      "#.............#",
      "#.............#",
      "#..###........#",
      "#..###........#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#B...........O#",
      "###############",
    ],
    // 7 — par 2: diagonal across a center pillar
    [
      "###############",
      "#2............#",
      "#.B...........#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#......##.....#",
      "#......##.....#",
      "#......##.....#",
      "#......##.....#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#............O#",
      "###############",
    ],
    // 8 — par 3: walled box, one entry
    [
      "###############",
      "#3............#",
      "#.B...........#",
      "#.............#",
      "#.............#",
      "#...#######...#",
      "#...#.....#...#",
      "#...#.....#...#",
      "#...#.....#...#",
      "#...#.....#...#",
      "#...#...O.....#",
      "#...#.....#...#",
      "#...#.....#...#",
      "#...#.....#...#",
      "#...#######...#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "###############",
    ],
    // 9 — par 4: serpentine gauntlet
    [
      "###############",
      "#4............#",
      "#B............#",
      "#.............#",
      "#########....##",
      "#.............#",
      "#.............#",
      "#.............#",
      "####...########",
      "#.............#",
      "#.............#",
      "#.............#",
      "##########....#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#.............#",
      "#............O#",
      "###############",
    ],
  ];

  // Parse a level: walls as 32px rects, ball/hole centers, par from digits.
  const parseLevel = (rows) => {
    const h = rows.length;
    const w = rows[0].length;
    let par = 2, ball = null, hole = null;
    const walls = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = rows[y][x];
        if (ch === "#") walls.push({ x: x * GRID, y: y * GRID, w: GRID, h: GRID });
        else if (ch === "B") ball = { x: x * GRID + GRID / 2, y: y * GRID + GRID / 2 };
        else if (ch === "O") hole = { x: x * GRID + GRID / 2, y: y * GRID + GRID / 2 };
        else if (ch >= "1" && ch <= "9") par = Number(ch);
      }
    }
    return { par, ball, hole, walls, w: w * GRID, h: h * GRID };
  };

  // Reflect velocity off an axis-aligned wall rect: negate exactly one
  // axis (least penetration wins so corner clips bounce naturally) and
  // conserve the other untouched.
  const bounce = (v, ball, rect) => {
    const overlapL = ball.x + BALL_R - rect.x;
    const overlapR = rect.x + rect.w - (ball.x - BALL_R);
    const overlapT = ball.y + BALL_R - rect.y;
    const overlapB = rect.y + rect.h - (ball.y - BALL_R);
    const ox = Math.min(overlapL, overlapR);
    const oy = Math.min(overlapT, overlapB);
    if (ox < oy) return { x: -v.x, y: v.y };
    return { x: v.x, y: -v.y };
  };

  // Advance one frame at 60fps: friction, move, wall bounces, capture.
  const stepBall = (ball, v, walls, hole) => {
    let nv = { x: v.x * FRICTION, y: v.y * FRICTION };
    let nb = { x: ball.x + nv.x, y: ball.y + nv.y };
    for (const r of walls) {
      const hit = nb.x + BALL_R > r.x && nb.x - BALL_R < r.x + r.w &&
                  nb.y + BALL_R > r.y && nb.y - BALL_R < r.y + r.h;
      if (!hit) continue;
      nv = bounce(nv, nb, r);
      nb = { x: nb.x + nv.x, y: nb.y + nv.y };
    }
    const speed = Math.hypot(nv.x, nv.y);
    const dx = nb.x - hole.x, dy = nb.y - hole.y;
    const sunk = dx * dx + dy * dy < HOLE_R * HOLE_R && speed < CAPTURE_SPEED;
    if (speed < STOP_SPEED) nv = { x: 0, y: 0 };
    return { ball: nb, v: nv, sunk, stopped: speed < STOP_SPEED && !sunk };
  };

  // Scoring math: stroke play — total is the exact Σ(strokes − par).
  const totalVsPar = (strokesList, levels) => {
    let t = 0;
    for (let i = 0; i < strokesList.length && i < levels.length; i++)
      t += strokesList[i] - levels[i].par;
    return t;
  };

  globalThis.GolfCore = {
    GRID, FRICTION, STOP_SPEED, BALL_R, HOLE_R, CAPTURE_SPEED, MAX_DRAG, MAX_POWER,
    HOLES, parseLevel, bounce, stepBall, totalVsPar,
  };

  // ═══════════════════════════════════════════════════════════════════
  // END PURE CORE
  // ═══════════════════════════════════════════════════════════════════

  // ── DOM ──────────────────────────────────────────────────────────────
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");
  const holeChip = document.getElementById("holeChip");
  const strokesChip = document.getElementById("strokesChip");
  const bestEl = document.getElementById("best");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlaySub = document.getElementById("overlaySub");
  const overlayScore = document.getElementById("overlayScore");
  const installHint = document.getElementById("installHint");
  const startBtn = document.getElementById("startBtn");
  const soundBtn = document.getElementById("soundBtn");

  // ── state ────────────────────────────────────────────────────────────
  const W = 480, H = 640; // logical canvas size, matches the ASCII grid
  let course = HOLES.map((rows) => parseLevel(rows));
  let levelIndex = 0;
  let strokes = 0;
  let holeScores = [];          // strokes per completed hole
  let total = 0;                // running sum of (strokes - par), completed
  let ball, velocity;
  let phase = "title";          // title | play | holeDone | courseDone
  let aiming = false;
  let aimDir = { x: 0, y: 1 };  // current aim from ball
  let aimLen = 0;               // 0..MAX_DRAG drag length for this stroke
  let keyAngle = Math.PI / 2;   // keyboard aim (pointing down)
  let keyPower = 0.5;           // keyboard power 0..1
  const bestRaw = localStorage.getItem("golf_best");
  let best = bestRaw === null || bestRaw === "" ? NaN : Number(bestRaw);
  let lastT = 0;
  let flash = 0;                // frames of ink flash on sink/bounce

  const fmtDiff = (d) => (d > 0 ? `+${d}` : d < 0 ? String(d) : "E");

  const syncHud = () => {
    const lvl = course[levelIndex];
    holeChip.textContent = `HOLE ${levelIndex + 1} PAR ${lvl.par}`;
    strokesChip.textContent = `STROKES ${strokes}`;
    bestEl.textContent = `TOTAL ${fmtDiff(total)} · BEST ${Number.isFinite(best) ? fmtDiff(best) : "—"}`;
  };

  const hideOverlay = () => { overlay.style.display = "none"; };
  const showOverlay = () => { overlay.style.display = ""; };

  const loadHole = (i) => {
    levelIndex = i;
    ball = { ...course[i].ball };
    velocity = { x: 0, y: 0 };
    strokes = 0;
    aiming = false;
    aimLen = 0;
    syncHud();
  };

  const resetCourse = () => {
    holeScores = [];
    total = 0;
    loadHole(0);
  };

  // ── rendering ────────────────────────────────────────────────────────
  const ink = () => (root.dataset.theme === "dark" ? "#ffffff" : "#000000");
  const paper = () => (root.dataset.theme === "dark" ? "#000000" : "#ffffff");
  const soft = () => (root.dataset.theme === "dark" ? "#1c1c1c" : "#f2f2f2");

  const draw = () => {
    const lvl = course[levelIndex];
    ctx.fillStyle = paper();
    ctx.fillRect(0, 0, W, H);

    // soft grid dots at wall-free cell corners
    ctx.fillStyle = soft();
    for (let y = GRID; y < H; y += GRID)
      for (let x = GRID; x < W; x += GRID)
        ctx.fillRect(x - 1, y - 1, 2, 2);

    // walls — hard ink blocks
    ctx.fillStyle = flash > 0 && flash % 4 < 2 ? soft() : ink();
    for (const r of lvl.walls) ctx.fillRect(r.x, r.y, r.w, r.h);

    // hole — ink block with paper mouth
    ctx.fillStyle = ink();
    ctx.fillRect(lvl.hole.x - HOLE_R, lvl.hole.y - HOLE_R, HOLE_R * 2, HOLE_R * 2);
    ctx.fillStyle = paper();
    ctx.fillRect(lvl.hole.x - HOLE_R + 5, lvl.hole.y - HOLE_R + 5, (HOLE_R - 5) * 2, (HOLE_R - 5) * 2);

    // ball — square, with a tick notch
    ctx.fillStyle = ink();
    ctx.fillRect(ball.x - BALL_R, ball.y - BALL_R, BALL_R * 2, BALL_R * 2);
    ctx.fillStyle = paper();
    ctx.fillRect(ball.x - BALL_R + 3, ball.y - BALL_R + 3, 4, 4);
    ctx.fillStyle = ink();

    // aim guide — dotted ink line from the ball
    if (phase === "play" && !velocityActive() && (aiming || aimLen > 0)) {
      const len = Math.min(aimLen, MAX_DRAG) / MAX_DRAG * MAX_POWER;
      const n = Math.max(2, Math.round(len));
      for (let i = 1; i <= n; i++) {
        const px = ball.x + (aimDir.x / Math.hypot(aimDir.x, aimDir.y)) * i * 10;
        const py = ball.y + (aimDir.y / Math.hypot(aimDir.x, aimDir.y)) * i * 10;
        if (px > 4 && px < W - 4 && py > 4 && py < H - 4) ctx.fillRect(px - 2, py - 2, 4, 4);
      }
    }
  };

  const velocityActive = () => velocity.x !== 0 || velocity.y !== 0;

  // ── physics (fixed 60fps steps) ──────────────────────────────────────
  const physicsStep = () => {
    const lvl = course[levelIndex];
    const res = stepBall(ball, velocity, lvl.walls, lvl.hole);
    ball = res.ball;
    velocity = res.v;
    if (res.sunk) sinkBall();
    else if (res.stopped) velocity = { x: 0, y: 0 };
  };

  const sinkBall = () => {
    holeScores[levelIndex] = strokes;
    total += strokes - course[levelIndex].par;
    sinkSfx();
    flash = 30;
    velocity = { x: 0, y: 0 };
    if (levelIndex === course.length - 1) courseComplete();
    else holeComplete();
  };

  const holeComplete = () => {
    phase = "holeDone";
    const par = course[levelIndex].par;
    overlayTitle.innerHTML = `HOLE ${levelIndex + 1}<br>COMPLETE`;
    overlaySub.textContent = strokes === 1 ? "HOLE IN ONE" : strokes === par ? "PAR" : strokes < par ? "BIRDIE" : `${strokes - par} OVER PAR`;
    overlayScore.hidden = false;
    overlayScore.textContent = `STROKES ${strokes} · PAR ${par} — ${fmtDiff(strokes - par)} · TOTAL ${fmtDiff(total)}`;
    startBtn.textContent = "NEXT HOLE";
    showOverlay();
    syncHud();
  };

  const courseComplete = () => {
    phase = "courseDone";
    winSfx();
    if (!Number.isFinite(best) || total < best) {
      best = total;
      localStorage.setItem("golf_best", String(best));
    }
    const parTotal = course.reduce((s, l) => s + l.par, 0);
    overlayTitle.innerHTML = "COURSE<br>COMPLETE";
    overlaySub.textContent = `${holeScores.reduce((a, b) => a + b, 0)} STROKES · PAR ${parTotal}`;
    overlayScore.hidden = false;
    overlayScore.textContent = `TOTAL ${fmtDiff(total)} · BEST ${fmtDiff(best)}`;
    startBtn.textContent = "PLAY AGAIN";
    showOverlay();
    syncHud();
  };

  const overlayVisible = () => overlay.style.display !== "none";

  // ── flow ─────────────────────────────────────────────────────────────
  const start = () => {
    unlockAudio();
    if (phase === "play") return;
    if (phase === "title") resetCourse();
    else if (phase === "holeDone") loadHole(levelIndex + 1);
    else if (phase === "courseDone") resetCourse();
    phase = "play";
    hideOverlay();
  };

  const frame = (t) => {
    const dt = Math.min((t - lastT) / 1000, 0.05);
    lastT = t;
    if (phase === "play" && velocityActive()) {
      const steps = Math.max(1, Math.round(dt * 60));
      for (let i = 0; i < steps && velocityActive() && phase === "play"; i++) physicsStep();
    }
    if (flash > 0) flash--;
    draw();
    requestAnimationFrame(frame);
  };

  // ── launch ───────────────────────────────────────────────────────────
  const launch = (dir, power01) => {
    if (phase !== "play" || velocityActive()) return false;
    const mag = MAX_POWER * Math.max(0, Math.min(1, power01));
    if (mag < 1) return false;
    velocity = { x: dir.x * mag, y: dir.y * mag };
    strokes++;
    puttSfx(power01);
    syncHud();
    return true;
  };

  // ── input: pointer drag from the ball ────────────────────────────────
  const canvasPos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const scale = W / rect.width;
    return { x: (e.clientX - rect.left) * scale, y: (e.clientY - rect.top) * (H / rect.height) };
  };

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (phase !== "play" || velocityActive()) return;
    const p = canvasPos(e);
    if (Math.hypot(p.x - ball.x, p.y - ball.y) > 56) return; // must press at the ball
    aiming = true;
    updateAim(p);
  });

  const updateAim = (p) => {
    const dx = p.x - ball.x, dy = p.y - ball.y;
    const len = Math.hypot(dx, dy);
    if (len < 4) { aimLen = 0; return; }
    aimDir = { x: dx / len, y: dy / len };
    aimLen = len;
  };

  canvas.addEventListener("pointermove", (e) => {
    if (!aiming) return;
    e.preventDefault();
    updateAim(canvasPos(e));
  });

  const endAim = (e) => {
    if (!aiming) return;
    aiming = false;
    e?.preventDefault?.();
    const dx = Math.hypot(aimDir.x, aimDir.y) ? aimDir.x : 0;
    const dy = Math.hypot(aimDir.x, aimDir.y) ? aimDir.y : 0;
    const power = Math.min(aimLen, MAX_DRAG) / MAX_DRAG;
    if (dx || dy) launch({ x: dx, y: dy }, power);
    aimLen = 0;
  };

  canvas.addEventListener("pointerup", endAim);
  canvas.addEventListener("pointercancel", endAim);

  // ── keyboard: arrows aim, up/down power, space putts ─────────────────
  document.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.code === "Space" || e.code === "Enter") {
      e.preventDefault();
      if (overlayVisible()) start();
      else launch(aimDir, keyPower);
      return;
    }
    if (phase !== "play") return;
    if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
      e.preventDefault();
      keyAngle += (e.code === "ArrowRight" ? 1 : -1) * Math.PI / 24;
      aimDir = { x: Math.cos(keyAngle), y: Math.sin(keyAngle) };
      aimLen = MAX_DRAG * keyPower;
    } else if (e.code === "ArrowUp" || e.code === "ArrowDown") {
      e.preventDefault();
      keyPower = Math.max(0.05, Math.min(1, keyPower + (e.code === "ArrowUp" ? 0.1 : -0.1)));
      aimDir = { x: Math.cos(keyAngle), y: Math.sin(keyAngle) };
      aimLen = MAX_DRAG * keyPower;
    }
  });

  startBtn.addEventListener("click", start);
  // tap anywhere on the instructions panel = start/continue (touch-first)
  document.querySelector(".overlay__panel")?.addEventListener("click", (e) => {
    if (e.target !== startBtn) start();
  });

  // sound toggle
  soundBtn.addEventListener("click", (e) => {
    soundOn = !soundOn;
    e.currentTarget.setAttribute("aria-pressed", String(soundOn));
    e.currentTarget.textContent = `SOUND: ${soundOn ? "ON" : "OFF"}`;
    unlockAudio();
  });

  // ── boot ─────────────────────────────────────────────────────────────
  resetCourse();
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
