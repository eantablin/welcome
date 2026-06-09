/* =====================================================================
   boot.js — orchestrator. Picks the hero renderer, wires interactions,
   and hands the arcade layer the boot sequence + mini-game.
   ===================================================================== */
import { setYear, initNav, initRuler, initReveal, initStats, initTyped, initGridParallax } from "./ui.js";
import { initArcade } from "./arcade.js";

const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
const FINE = matchMedia("(hover: hover) and (pointer: fine)").matches;
const SMALL = matchMedia("(max-width: 860px)").matches;
const LOW_POWER = SMALL || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || /Mobi|Android/i.test(navigator.userAgent);

function supportsWebGL() {
  try { const c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl"))); }
  catch (e) { return false; }
}

async function startHero() {
  const canvas = document.getElementById("hero-canvas");
  if (!canvas || !supportsWebGL()) { canvas?.classList.add("is-ready"); return; }
  try { const { initHero } = await import("./hero3d.js"); await initHero(canvas, { reduce: REDUCE, lowPower: LOW_POWER }); }
  catch (err) { console.warn("[antablin] hero WebGL failed", err); canvas.classList.add("is-ready"); }
}

function boot() {
  setYear(); initNav(); initRuler(); initReveal(); initStats(); initTyped();
  if (FINE && !REDUCE) initGridParallax();
  startHero();
  initArcade();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
