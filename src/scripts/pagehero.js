/* =====================================================================
   pagehero.js — subtle particle drift behind subpage heroes.
   Tinted to the page's --accent. Injected by JS so pages need no markup.
   Perf guards: skipped on reduced-motion, paused when hidden/offscreen,
   sparse particle count.
   ===================================================================== */
export function initPageHero() {
  const hero = document.querySelector(".page-hero");
  if (!hero) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const canvas = document.createElement("canvas");
  canvas.className = "page-hero__fx";
  canvas.setAttribute("aria-hidden", "true");
  hero.prepend(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // accent comes from the page's main[style="--accent:…"] (or the default cyan)
  const accent =
    getComputedStyle(hero.closest("main") || hero).getPropertyValue("--accent").trim() || "#2ee6ff";

  let w, h, dpr, raf = 0, running = false;
  let dots = [];

  function build() {
    const count = Math.min(46, Math.floor((w * h) / 26000));
    dots = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 0.8 + Math.random() * 1.6,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.12,
      a: 0.12 + Math.random() * 0.3,
      tw: Math.random() * Math.PI * 2, // twinkle phase
    }));
  }
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = hero.clientWidth;
    h = hero.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
    if (!running) draw(0);
  }
  function draw(t) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = accent;
    for (const d of dots) {
      d.x += d.vx; d.y += d.vy;
      if (d.x < -4) d.x = w + 4; if (d.x > w + 4) d.x = -4;
      if (d.y < -4) d.y = h + 4; if (d.y > h + 4) d.y = -4;
      ctx.globalAlpha = d.a * (0.6 + 0.4 * Math.sin(t / 900 + d.tw));
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, 7);
      ctx.fill();
    }
    // a few faint connecting lines near the top for structure
    ctx.globalAlpha = 0.05;
    ctx.strokeStyle = accent;
    for (let i = 0; i < dots.length - 1; i += 6) {
      ctx.beginPath();
      ctx.moveTo(dots[i].x, dots[i].y);
      ctx.lineTo(dots[i + 1].x, dots[i + 1].y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function tick(t) {
    draw(t);
    if (running) raf = requestAnimationFrame(tick);
  }
  function start() { if (running || reduce) return; running = true; raf = requestAnimationFrame(tick); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => entries.forEach((e) => (e.isIntersecting ? start() : stop())),
      { threshold: 0.01 }
    ).observe(canvas);
  }

  resize();
  canvas.classList.add("is-ready");
  if (reduce) draw(0);
  else start();
}
