/* =====================================================================
   ui.js — nav, scroll choreography, typed hero line, count-up stats
   ===================================================================== */
const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
const FINE = matchMedia("(hover: hover) and (pointer: fine)").matches;

export function setYear() {
  const y = document.getElementById("year");
  if (y) y.textContent = String(new Date().getFullYear());
}

export function initNav() {
  const nav = document.getElementById("nav");
  const toggle = document.getElementById("navToggle");
  const links = document.getElementById("navLinks");
  if (!nav) return;
  const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 40);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  if (toggle && links) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      links.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    links.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => {
      nav.classList.remove("is-open"); links.classList.remove("is-open"); toggle.setAttribute("aria-expanded", "false");
    }));
  }

  const map = new Map();
  document.querySelectorAll(".nav__links a").forEach((a) => {
    const h = a.getAttribute("href") || ""; if (h.startsWith("#")) map.set(h.slice(1), a);
  });
  const sections = [...map.keys()].map((id) => document.getElementById(id)).filter(Boolean);
  if ("IntersectionObserver" in window && sections.length) {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      map.forEach((a) => a.classList.remove("is-active"));
      map.get(e.target.id)?.classList.add("is-active");
    }), { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach((s) => io.observe(s));
  }
}

export function initRuler() {
  const fill = document.getElementById("rulerFill");
  if (!fill) return;
  let ticking = false;
  const update = () => { const max = document.documentElement.scrollHeight - window.innerHeight; fill.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + "%"; ticking = false; };
  window.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  update();
}

export function initReveal() {
  const els = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("is-visible")); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); }
  }), { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
  els.forEach((e) => io.observe(e));
}

export function initStats() {
  const nums = document.querySelectorAll(".stat__num[data-count]");
  if (!nums.length) return;
  const run = (el) => {
    const target = parseFloat(el.dataset.count) || 0;
    const prefix = el.dataset.prefix || "", suffix = el.dataset.suffix || "";
    const paint = (n) => (el.textContent = prefix + Math.round(n) + suffix);
    if (REDUCE) { paint(target); return; }
    const dur = 1200, t0 = performance.now();
    const step = (now) => { const t = Math.min(1, (now - t0) / dur); paint((1 - Math.pow(1 - t, 3)) * target); if (t < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };
  if (!("IntersectionObserver" in window)) { nums.forEach(run); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { run(e.target); io.unobserve(e.target); } }), { threshold: 0.6 });
  nums.forEach((n) => io.observe(n));
}

/* typed hero line — cycles data-phrases (pipe-separated) */
export function initTyped() {
  const el = document.getElementById("typed");
  if (!el) return;
  const phrases = (el.dataset.phrases || "").split("|").filter(Boolean);
  if (!phrases.length) return;
  const caret = document.createElement("span"); caret.className = "hero__caret";
  el.after(caret);
  if (REDUCE) { el.textContent = phrases[0]; return; }
  let p = 0, i = 0, deleting = false;
  const tick = () => {
    const cur = phrases[p];
    el.textContent = cur.slice(0, i);
    if (!deleting && i < cur.length) { i++; setTimeout(tick, 42); }
    else if (!deleting && i === cur.length) { deleting = true; setTimeout(tick, 1700); }
    else if (deleting && i > 0) { i--; setTimeout(tick, 22); }
    else { deleting = false; p = (p + 1) % phrases.length; setTimeout(tick, 320); }
  };
  tick();
}

export function initGridParallax() {
  if (!FINE || REDUCE) return;
  const grid = document.querySelector(".grid-bg");
  if (!grid) return;
  window.addEventListener("pointermove", (e) => {
    const x = e.clientX / innerWidth - 0.5, y = e.clientY / innerHeight - 0.5;
    grid.style.transform = `translate3d(${x * -16}px, ${y * -16}px, 0)`;
  }, { passive: true });
}
