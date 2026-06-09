/* =====================================================================
   arcade.js — the retro-arcade soul.
   • Boot sequence ("PRESS START")
   • HUD: jiggies + score + toggles
   • Banjo-Kazooie style jiggy collectathon (ascending note chimes)
   • CRT mode (Konami code or HUD toggle)
   • Launches the hidden MONOLITH SMASH mini-game
   ===================================================================== */
const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- tiny WebAudio chiptune synth ---------- */
let actx = null, soundOn = true;
function audio() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
  if (actx && actx.state === "suspended") actx.resume();
  return actx;
}
function blip(freq, dur = 0.09, type = "square", gain = 0.06) {
  const ac = audio(); if (!ac || !soundOn) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(gain, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
  o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + dur);
}
// Banjo note-collect: pitch climbs with each note grabbed
const NOTE_SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
function sfxNote(i) { blip(NOTE_SCALE[Math.min(i, NOTE_SCALE.length - 1)], 0.12, "triangle", 0.08); }
function sfxFanfare() {
  const seq = [523, 659, 783, 1046, 1318];
  seq.forEach((f, k) => setTimeout(() => blip(f, 0.18, "triangle", 0.09), k * 110));
}
export function sfx(name) { if (name === "blip") blip(440, 0.05, "square", 0.04); }

/* ---------- state ---------- */
const state = { score: 0, jiggies: 0, jiggiesTotal: 5 };
let hudScore, hudJig;
function addScore(n) { state.score += n; if (hudScore) hudScore.textContent = state.score.toLocaleString(); }

/* ---------- boot sequence ---------- */
const BOOT_LINES = [
  "ANTABLIN OS v2.0 — cold boot",
  "[<b>ok</b>] mount /agents .............. online",
  "[<b>ok</b>] load RAG index ............. 4,096 vectors",
  "[<b>ok</b>] warm LLM reasoning core .... ready",
  "[<b>ok</b>] establish MCP tools ........ connected",
  "[<b>ok</b>] arm SRE pagers ............. standing by",
  "<span class='ok'>agent-swarm: 20 nodes · signals nominal</span>",
  "&gt; ready.",
];
function runBoot(onStart) {
  const boot = document.getElementById("boot");
  const log = document.getElementById("bootLog");
  const startBtn = document.getElementById("bootStart");
  const skipBtn = document.getElementById("bootSkip");
  if (!boot) { onStart(); return; }

  const finish = () => {
    if (boot.classList.contains("is-done")) return;
    audio(); // unlock audio on the user gesture
    blip(880, 0.12, "square", 0.07);
    boot.classList.add("is-done");
    document.body.classList.remove("boot-lock");
    document.body.classList.add("loaded");
    sessionStorage.setItem("booted", "1");
    setTimeout(() => boot.remove(), 700);
    onStart();
  };

  // Skip replay within the same tab session, or for reduced-motion.
  if (REDUCE || sessionStorage.getItem("booted")) {
    boot.classList.add("is-done"); document.body.classList.remove("boot-lock"); document.body.classList.add("loaded");
    setTimeout(() => boot.remove(), 50); onStart(); return;
  }

  document.body.classList.add("boot-lock");
  startBtn?.addEventListener("click", finish);
  skipBtn?.addEventListener("click", finish);
  window.addEventListener("keydown", function onKey(e) {
    if (e.key === "Enter" && startBtn?.classList.contains("show")) { finish(); window.removeEventListener("keydown", onKey); }
  });

  let i = 0;
  const cursor = "<span class='boot__cursor'></span>";
  (function typeLine() {
    if (i >= BOOT_LINES.length) { startBtn?.classList.add("show"); return; }
    log.innerHTML = BOOT_LINES.slice(0, i + 1).join("\n") + cursor;
    blip(220 + i * 30, 0.04, "square", 0.03);
    i++;
    setTimeout(typeLine, 230);
  })();
}

/* ---------- jiggy collectathon ---------- */
function placeJiggies() {
  const zones = [...document.querySelectorAll("[data-jiggy-zone]")];
  state.jiggiesTotal = zones.length;
  if (hudJig) hudJig.textContent = `${state.jiggies}/${state.jiggiesTotal}`;
  const jiggySVG = `<svg viewBox="0 0 100 100" aria-hidden="true"><path fill="#ffd25a" stroke="#b8860b" stroke-width="4" stroke-linejoin="round" d="M22 22 L41 22 C41 10 59 10 59 22 L78 22 L78 41 C90 41 90 59 78 59 L78 78 L59 78 C59 66 41 66 41 78 L22 78 L22 59 C34 59 34 41 22 41 L22 22 Z"/></svg>`;
  zones.forEach((zone, idx) => {
    const j = document.createElement("button");
    j.className = "jiggy";
    j.type = "button";
    j.setAttribute("aria-label", "Collect a hidden jiggy");
    j.innerHTML = jiggySVG;
    // tuck it in a varied spot inside the section
    const top = 30 + ((idx * 47) % 60);
    const left = idx % 2 === 0 ? 4 + ((idx * 13) % 10) : 86 - ((idx * 11) % 12);
    j.style.top = top + "%";
    j.style.left = left + "%";
    if (getComputedStyle(zone).position === "static") zone.style.position = "relative";
    zone.appendChild(j);
    j.addEventListener("click", () => {
      if (j.classList.contains("collected")) return;
      j.classList.add("collected");
      sfxNote(state.jiggies);
      state.jiggies++;
      addScore(250);
      if (hudJig) hudJig.textContent = `${state.jiggies}/${state.jiggiesTotal}`;
      if (state.jiggies === state.jiggiesTotal) allJiggies();
    });
  });
}
function allJiggies() {
  sfxFanfare();
  addScore(1000);
  const toast = document.getElementById("toast");
  if (toast) {
    toast.textContent = "🧩 ALL PIECES! Mini-game unlocked — press ▶";
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 5000);
  }
  document.getElementById("hudPlay")?.classList.add("on");
}

/* ---------- HUD toggles ---------- */
function wireHud(openGame) {
  const hud = document.getElementById("hud");
  hudScore = document.getElementById("hudScore");
  hudJig = document.getElementById("hudJig");
  if (hud) state.jiggiesTotal = parseInt(hud.dataset.jiggiesTotal || "5", 10);

  document.getElementById("hudSound")?.addEventListener("click", (e) => {
    soundOn = !soundOn; e.currentTarget.classList.toggle("on", soundOn);
    e.currentTarget.setAttribute("aria-pressed", String(soundOn));
    if (soundOn) blip(660, 0.08);
  });
  document.getElementById("hudCrt")?.addEventListener("click", (e) => {
    const on = document.body.classList.toggle("crt");
    e.currentTarget.classList.toggle("on", on); blip(on ? 330 : 220, 0.08);
  });
  document.getElementById("hudPlay")?.addEventListener("click", () => { blip(523, 0.08); openGame(); });
}

/* ---------- Konami → CRT ---------- */
function wireKonami() {
  const code = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","b","a"];
  let pos = 0;
  window.addEventListener("keydown", (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    pos = k === code[pos] ? pos + 1 : (k === code[0] ? 1 : 0);
    if (pos === code.length) {
      pos = 0;
      const on = document.body.classList.toggle("crt");
      document.getElementById("hudCrt")?.classList.toggle("on", on);
      sfxFanfare();
      const toast = document.getElementById("toast");
      if (toast) { toast.textContent = "▦ CRT MODE " + (on ? "ENGAGED" : "OFF"); toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"), 3000); }
    }
  });
}

/* ---------- mini-game wiring ---------- */
async function setupGame() {
  const modal = document.getElementById("arcade");
  const canvas = document.getElementById("gameCanvas");
  const closeBtn = document.getElementById("arcadeClose");
  if (!modal || !canvas) return () => {};
  let game = null;
  const { createGame } = await import("./minigame.js");
  const open = () => {
    if (modal.classList.contains("open")) return; // already running — don't stack instances
    if (game) game.stop();
    modal.classList.add("open");
    document.body.classList.add("boot-lock");
    game = createGame(canvas, { onScore: () => {}, onEnd: (s) => { addScore(s); }, blip });
    game.start();
  };
  const close = () => { modal.classList.remove("open"); document.body.classList.remove("boot-lock"); game?.stop(); game = null; };
  closeBtn?.addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && modal.classList.contains("open")) close(); });
  return open;
}

export async function initArcade() {
  const openGame = await setupGame();
  wireHud(openGame);
  wireKonami();
  runBoot(() => { placeJiggies(); });
}
