/* =====================================================================
   hero3d.js — the WebGL centerpiece: a 3D "agent network".
   Glowing agent-nodes wired into a graph; signal pulses route along the
   edges (observe → reason → act). Drifting particle field, cursor
   parallax, optional bloom. Pauses offscreen / hidden / reduced-motion.
   ===================================================================== */

export async function initHero(canvas, options = {}) {
  const { reduce = false, lowPower = false } = options;
  const THREE = await import("three");

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x06070d, 0.055);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 10);

  const group = new THREE.Group();
  scene.add(group);

  const C_CYAN = new THREE.Color(0x2ee6ff);
  const C_PURPLE = new THREE.Color(0xa855f7);
  const C_GREEN = new THREE.Color(0x36f9b3);
  const C_MAGENTA = new THREE.Color(0xff7ac6);
  const sigColors = [C_CYAN, C_PURPLE, C_GREEN, C_MAGENTA];

  // ---- agent nodes on a sphere ----
  const NODE_COUNT = lowPower ? 12 : 20;
  const nodes = [];
  for (let i = 0; i < NODE_COUNT; i++) {
    // fibonacci sphere for even distribution
    const y = 1 - (i / (NODE_COUNT - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = i * 2.399963;
    const radius = 3.4;
    nodes.push(new THREE.Vector3(Math.cos(theta) * r * radius, y * radius, Math.sin(theta) * r * radius));
  }

  const nodeGeo = new THREE.BufferGeometry().setAttribute(
    "position",
    new THREE.Float32BufferAttribute(nodes.flatMap((n) => [n.x, n.y, n.z]), 3)
  );
  const nodePoints = new THREE.Points(
    nodeGeo,
    new THREE.PointsMaterial({ color: C_CYAN, size: 0.22, transparent: true, opacity: 0.95, sizeAttenuation: true, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  group.add(nodePoints);

  // ---- edges: connect each node to its nearest neighbors ----
  const edges = [];
  const edgePositions = [];
  for (let i = 0; i < nodes.length; i++) {
    const dists = nodes.map((n, j) => ({ j, d: nodes[i].distanceTo(n) })).filter((o) => o.j !== i).sort((a, b) => a.d - b.d);
    const k = 3;
    for (let m = 0; m < k; m++) {
      const j = dists[m].j;
      if (i < j) { edges.push([i, j]); edgePositions.push(nodes[i].x, nodes[i].y, nodes[i].z, nodes[j].x, nodes[j].y, nodes[j].z); }
    }
  }
  const edgeLines = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(edgePositions, 3)),
    new THREE.LineBasicMaterial({ color: C_CYAN, transparent: true, opacity: 0.13 })
  );
  group.add(edgeLines);

  // ---- signal pulses travelling along edges ----
  const SIGNALS = lowPower ? 16 : 34;
  const sigPos = new Float32Array(SIGNALS * 3);
  const sigCol = new Float32Array(SIGNALS * 3);
  const sigState = [];
  function spawnSignal(i) {
    const e = edges[(Math.random() * edges.length) | 0];
    const c = sigColors[(Math.random() * sigColors.length) | 0];
    sigState[i] = { a: e[0], b: e[1], t: Math.random(), speed: 0.35 + Math.random() * 0.7 };
    sigCol[i * 3] = c.r; sigCol[i * 3 + 1] = c.g; sigCol[i * 3 + 2] = c.b;
  }
  for (let i = 0; i < SIGNALS; i++) spawnSignal(i);
  const sigGeo = new THREE.BufferGeometry();
  sigGeo.setAttribute("position", new THREE.BufferAttribute(sigPos, 3));
  sigGeo.setAttribute("color", new THREE.BufferAttribute(sigCol, 3));
  const signals = new THREE.Points(
    sigGeo,
    new THREE.PointsMaterial({ size: 0.16, transparent: true, opacity: 1, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true })
  );
  group.add(signals);

  // ---- core ring + drifting particle field ----
  const ring = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(5.4, 1)),
    new THREE.LineBasicMaterial({ color: C_PURPLE, transparent: true, opacity: 0.07 })
  );
  scene.add(ring);

  const COUNT = lowPower ? 300 : 900;
  const fpos = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    const r = 7 + Math.random() * 9, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    fpos[i * 3] = r * Math.sin(ph) * Math.cos(th); fpos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th); fpos[i * 3 + 2] = r * Math.cos(ph);
  }
  const field = new THREE.Points(
    new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(fpos, 3)),
    new THREE.PointsMaterial({ color: 0x9fb6d4, size: 0.045, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })
  );
  scene.add(field);

  // ---- optional bloom ----
  let composer = null;
  if (!lowPower && !reduce) {
    try {
      const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
        import("three/examples/jsm/postprocessing/EffectComposer.js"),
        import("three/examples/jsm/postprocessing/RenderPass.js"),
        import("three/examples/jsm/postprocessing/UnrealBloomPass.js"),
        import("three/examples/jsm/postprocessing/OutputPass.js"),
      ]);
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.75, 0.6, 0.1));
      composer.addPass(new OutputPass());
      composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    } catch (e) { composer = null; }
  }

  const clock = new THREE.Clock();
  let elapsed = 0, running = false, raf = 0;
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  const va = new THREE.Vector3(), vb = new THREE.Vector3();

  function resize() {
    const w = canvas.clientWidth || canvas.offsetWidth, h = canvas.clientHeight || canvas.offsetHeight;
    if (!w || !h) return;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h, false); if (composer) composer.setSize(w, h);
    if (!running) render();
  }
  function render() { composer ? composer.render() : renderer.render(scene, camera); }

  function updateSignals(dt) {
    for (let i = 0; i < SIGNALS; i++) {
      const s = sigState[i];
      s.t += s.speed * dt;
      if (s.t >= 1) { spawnSignal(i); continue; }
      va.copy(nodes[s.a]); vb.copy(nodes[s.b]);
      va.lerp(vb, s.t);
      sigPos[i * 3] = va.x; sigPos[i * 3 + 1] = va.y; sigPos[i * 3 + 2] = va.z;
    }
    sigGeo.attributes.position.needsUpdate = true;
  }

  function tick() {
    const dt = clock.getDelta(); elapsed += dt; const t = elapsed;
    ptr.x += (ptr.tx - ptr.x) * 0.05; ptr.y += (ptr.ty - ptr.y) * 0.05;
    group.rotation.y = t * 0.1 + ptr.x * 0.5;
    group.rotation.x = Math.sin(t * 0.16) * 0.14 + ptr.y * 0.28;
    ring.rotation.y = -t * 0.04; ring.rotation.z = t * 0.02;
    field.rotation.y = t * 0.016;
    updateSignals(dt);
    camera.position.x += (ptr.x * 0.9 - camera.position.x) * 0.04;
    camera.position.y += (-ptr.y * 0.7 - camera.position.y) * 0.04;
    camera.lookAt(0, 0, 0);
    render();
    raf = requestAnimationFrame(tick);
  }
  function start() { if (running || reduce) return; running = true; clock.getDelta(); raf = requestAnimationFrame(tick); }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); }

  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("pointermove", (e) => { ptr.tx = (e.clientX / window.innerWidth) * 2 - 1; ptr.ty = (e.clientY / window.innerHeight) * 2 - 1; }, { passive: true });
  document.addEventListener("visibilitychange", () => { document.hidden ? stop() : start(); });
  if ("IntersectionObserver" in window) new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? start() : stop())), { threshold: 0.01 }).observe(canvas);

  resize();
  canvas.classList.add("is-ready");
  if (reduce) { group.rotation.set(-0.15, 0.5, 0); updateSignals(0); render(); } else start();
  return true;
}
