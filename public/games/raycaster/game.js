// =====================================================================
// RAYS — brutalist raycaster demo. White paper, black ink, hard borders.
// DDA grid raycasting on an internal 320x200 canvas; wall columns are
// hatched ink (hatch density = distance shading, no smooth gradients).
// WASD move/strafe, arrows turn, plus on-screen touch buttons.
// Reaching the E cell clears the level; time is the score. Best persisted.
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
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur);
  };

  const stepSfx = () => beep(90, 0.04, "square", 0.03);
  const winSfx = () => { beep(660, 0.09); setTimeout(() => beep(990, 0.14), 90); };

  // ── constants ────────────────────────────────────────────────────────
  const W = 320, H = 200;             // logical canvas size
  const MID = H / 2;                  // hard floor/ceiling split

  //        0123456789012345
  const MAP = [
    "1111111111111111",
    "1      1       1",
    "1  11  1  111  1",
    "1  1         1 1",
    "1  1  111  1   1",
    "1     1     1  1",
    "1  111111   1  1",
    "1           1  1",
    "1  1  1      1 1",
    "1  1  11111    1",
    "1     1      E 1",
    "1  111111  11  1",
    "1           1  1",
    "1  11111   11  1",
    "1              1",
    "1111111111111111",
  ];
  const SPAWN = { px: 2.5, py: 2.5, dir: 0 };
  const RADIUS = 0.2;
  const SPEED = 2.2;   // cells / s
  const TSPEED = 3.0;  // rad / s
  const FOV = Math.PI / 3; // 60°

  const cellAt = (cx, cy, m = MAP) => (m[cy] && m[cy][cx]) || "1";

  // ── pure math (exercised by scripts/smoke-raycaster.mjs) ─────────────
  // DDA raycast from (px,py) at angle `a`; returns { dist, vert }.
  // dist = euclidean distance to the first wall; vert = hit a vertical
  // grid line (x-side). Coordinates are in cell units (x=col, y=row).
  const castRay = (px, py, a, m = MAP) => {
    const dx = Math.cos(a), dy = Math.sin(a);
    let cx = Math.floor(px), cy = Math.floor(py);
    const ddx = dx === 0 ? 1e30 : Math.abs(1 / dx);
    const ddy = dy === 0 ? 1e30 : Math.abs(1 / dy);
    let sx, sy, tx, ty;
    if (dx < 0) { sx = -1; tx = (px - cx) * ddx; } else { sx = 1; tx = (cx + 1 - px) * ddx; }
    if (dy < 0) { sy = -1; ty = (py - cy) * ddy; } else { sy = 1; ty = (cy + 1 - py) * ddy; }
    let vert = false, d = 0;
    for (let i = 0; i < 256; i++) {
      if (tx < ty) { d = tx; tx += ddx; cx += sx; vert = true; }
      else { d = ty; ty += ddy; cy += sy; vert = false; }
      if (cellAt(cx, cy, m) === "1") break;
    }
    return { dist: d, vert };
  };

  // circle-vs-grid collision: can a disc of radius r sit at (x,y)?
  const blocked = (x, y, r, m = MAP) => {
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
    const y0 = Math.floor(y - r), y1 = Math.floor(y + r);
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++)
        if (cellAt(cx, cy, m) === "1") return true;
    return false;
  };

  // one movement step, dt-scaled; slides along walls (x and y resolved apart)
  const move = (px, py, dir, fwd, strafe, dt, m = MAP) => {
    const nx = px + Math.cos(dir) * fwd * SPEED * dt - Math.sin(dir) * strafe * SPEED * dt;
    const ny = py + Math.sin(dir) * fwd * SPEED * dt + Math.cos(dir) * strafe * SPEED * dt;
    const next = { px, py };
    if (!blocked(nx, py, RADIUS, m)) next.px = nx;
    if (!blocked(next.px, ny, RADIUS, m)) next.py = ny;
    return next;
  };

  // ── state ────────────────────────────────────────────────────────────
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");
  const clockEl = document.getElementById("clock");
  const bestEl = document.getElementById("best");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlaySub = document.getElementById("overlaySub");
  const overlayScore = document.getElementById("overlayScore");
  const installHint = document.getElementById("installHint");
  const startBtn = document.getElementById("startBtn");
  const soundBtn = document.getElementById("soundBtn");
  const padBtns = document.querySelectorAll(".pad__btn");

  let px, py, dir, elapsed, running, lastT;
  let best = Number(localStorage.getItem("raycaster_best") ?? 0);
  bestEl.textContent = best ? `BEST ${best.toFixed(1)}` : "BEST –";

  const reset = () => {
    px = SPAWN.px; py = SPAWN.py; dir = SPAWN.dir;
    elapsed = 0; running = false;
    clockEl.textContent = "0.0";
  };

  // ── rendering ────────────────────────────────────────────────────────
  const ink = () => (root.dataset.theme === "dark" ? "#ffffff" : "#000000");
  const paper = () => (root.dataset.theme === "dark" ? "#000000" : "#ffffff");

  const draw = () => {
    // paper
    ctx.fillStyle = paper();
    ctx.fillRect(0, 0, W, H);

    // ceiling + hard split, then "floor" is the untouched paper below
    ctx.fillStyle = ink();
    ctx.fillRect(0, MID, W, 1);

    // one ray per column, wall column = hatched ink; density by distance
    for (let col = 0; col < W; col++) {
      const a = dir - FOV / 2 + FOV * (col / (W - 1));
      const { dist, vert } = castRay(px, py, a);
      const corrected = dist * Math.cos(a - dir); // remove fisheye
      const h = Math.min(H, Math.round(H / (corrected || 0.0001)));
      const y0 = Math.max(0, MID - Math.floor(h / 2));
      const y1 = Math.min(H, MID + Math.ceil(h / 2));
      if (y1 <= y0) continue;

      // near walls = solid ink; far walls = hatched bands
      if (corrected < 1.25) {
        ctx.fillRect(col, y0, 1, y1 - y0);
      } else {
        // hatch pitch grows with distance: 2 → 3 → 4 px spacing
        const pitch = corrected < 2.5 ? 2 : corrected < 4.5 ? 3 : 4;
        for (let yy = y0; yy < y1; yy += pitch) {
          ctx.fillRect(col, yy, 1, Math.min(2, y1 - yy));
        }
        // vertical faces get a slightly denser hatch (2px darker band)
        if (vert && corrected < 5.5) {
          ctx.fillRect(col, y0, 1, Math.min(2, y1 - y0));
        }
      }
    }

    // crosshair-free; hard black frame is chalked by CSS border
  };

  // ── flow ─────────────────────────────────────────────────────────────
  const onExit = () => {
    running = false;
    winSfx();
    const t = elapsed;
    if (!best || t < best) {
      best = t;
      localStorage.setItem("raycaster_best", String(best));
      bestEl.textContent = `BEST ${best.toFixed(1)}`;
    }
    overlayTitle.textContent = "LEVEL CLEAR";
    overlaySub.textContent = "NEW GAME RESTARTS";
    overlayScore.hidden = false;
    overlayScore.textContent = `TIME ${t.toFixed(1)}S · BEST ${best.toFixed(1)}S`;
    overlay.style.display = "";
  };

  const step = (dt) => {
    let fwd = 0, strafe = 0, turn = 0;
    if (keys.has("KeyW")) fwd += 1;
    if (keys.has("KeyS")) fwd -= 1;
    if (keys.has("KeyA")) strafe -= 1;
    if (keys.has("KeyD")) strafe += 1;
    if (keys.has("ArrowLeft")) turn -= 1;
    if (keys.has("ArrowRight")) turn += 1;
    if (touch.has("up")) fwd += 1;
    if (touch.has("down")) fwd -= 1;
    if (touch.has("left")) turn -= 1;
    if (touch.has("right")) turn += 1;
    dir += turn * TSPEED * dt;

    const next = move(px, py, dir, fwd, strafe, dt);
    if (next.px !== px || next.py !== py) {
      px = next.px; py = next.py;
      if (fwd !== 0 && Math.random() < 0.05) stepSfx();
    }
    // check exit cell
    if (cellAt(Math.floor(px), Math.floor(py)) === "E") {
      onExit();
      return;
    }
    elapsed += dt;
    clockEl.textContent = elapsed.toFixed(1);
  };

  const frame = (t) => {
    const dt = Math.min((t - lastT) / 1000, 0.033);
    lastT = t;
    if (running) step(dt);
    draw();
    requestAnimationFrame(frame);
  };

  const start = () => {
    if (running) return;
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ }
    }
    audioCtx?.resume?.();
    reset();
    running = true;
    overlay.style.display = "none";
  };

  // ── input ────────────────────────────────────────────────────────────
  const keys = new Set();
  const touch = new Set();
  const isOverlayVisible = () => overlay.style.display !== "none";

  document.addEventListener("keydown", (e) => {
    if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) {
      keys.add(e.code);
      e.preventDefault();
      return;
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.code)) {
      e.preventDefault();
      if (isOverlayVisible()) { start(); return; }
      if (e.code === "ArrowLeft" || e.code === "ArrowRight") keys.add(e.code);
      return;
    }
  });
  document.addEventListener("keyup", (e) => {
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowLeft", "ArrowRight"].includes(e.code)) {
      keys.delete(e.code);
    }
  });

  const bindPad = (btn, name) => {
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (isOverlayVisible()) { start(); return; }
      touch.add(name);
    });
    const release = (e) => { e.preventDefault(); touch.delete(name); };
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointercancel", release);
    btn.addEventListener("pointerleave", release);
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
  };

  globalThis.__rays_core__ = { castRay, blocked, move, cellAt };

  startBtn.addEventListener("click", start);

  soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    soundBtn.setAttribute("aria-pressed", String(soundOn));
    soundBtn.textContent = `SOUND: ${soundOn ? "ON" : "OFF"}`;
    if (soundOn && !audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ }
    }
  });

  padBtns.forEach((btn) => bindPad(btn, btn.dataset.key));

  // ── boot ─────────────────────────────────────────────────────────────
  reset();
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
