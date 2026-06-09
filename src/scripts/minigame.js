/* =====================================================================
   minigame.js — "MONOLITH SMASH"  (a Rampage-style roguelite brawler)

   You're an agent-kaiju razing a city of legacy systems.
   ← / →  move            ↑  jump (drift into a wall to climb)
   SPACE  punch (hold ↑/↓ or the back-arrow to aim up/down/behind)
   X      ground-pound (AoE) — in mid-air it becomes a dive-pound (bigger)
   Walk into humans to EAT them (heal). Every N points: pick 1 of 3 upgrades.
   Punches hit where the HAND lands; the body is your hurtbox.
   ===================================================================== */
export function createGame(canvas, { onEnd = () => {}, blip = () => {} } = {}) {
  const W = 900, H = 520, FLOOR_H = 26, GROUND = H - 46;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const ri = (n) => (Math.random() * n) | 0;
  const rf = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  const TYPES = {
    glass:    { body: "#13314c", edge: "#1d4a6e", win: "#2ee6ff", off: "#16314a", label: null, roof: "tank" },
    office:   { body: "#23262f", edge: "#2d313c", win: "#cfe0ff", off: "#1a1c22", label: null, roof: "ac" },
    brick:    { body: "#3a241d", edge: "#462c22", win: "#ffb070", off: "#281913", label: null, roof: "antenna" },
    factory:  { body: "#2a2a1c", edge: "#343422", win: "#ffd25a", off: "#1d1d12", label: null, roof: "stack", squat: true },
    monolith: { body: "#241a36", edge: "#2f2247", win: "#a855f7", off: "#1a142a", label: "LEGACY", roof: "antenna" },
  };
  const TKEYS = Object.keys(TYPES);

  const UPGRADES = [
    { name: "BIGGER FISTS", desc: "+40% punch damage", fn: (m) => (m.punchDmg *= 1.4) },
    { name: "LONG ARMS", desc: "+18 punch reach", fn: (m) => (m.reach += 18) },
    { name: "SEISMIC POUND", desc: "+40 range, +3 dmg", fn: (m) => { m.poundRange += 40; m.poundDmg += 3; } },
    { name: "TITAN HIDE", desc: "+2 max HP & heal", fn: (m) => { m.maxHp += 2; m.hp = Math.min(m.maxHp, m.hp + 2); } },
    { name: "SWIFT", desc: "+25% move speed", fn: (m) => (m.speed *= 1.25) },
    { name: "SPRING LEGS", desc: "higher jump", fn: (m) => (m.jumpV += 120) },
    { name: "CARNIVORE", desc: "eating heals +1", fn: (m) => (m.eatHeal += 1) },
    { name: "BERSERK", desc: "+30% score gain", fn: (m) => (m.scoreMult *= 1.3) },
    { name: "REGEN", desc: "slowly heal over time", fn: (m) => (m.regen += 0.18) },
    { name: "IRON SKIN", desc: "-30% damage taken", fn: (m) => (m.armor *= 0.7) },
  ];

  let raf = 0, running = false, last = 0, state;
  const keys = new Set();
  const L = () => keys.has("ArrowLeft"), R = () => keys.has("ArrowRight"), U = () => keys.has("ArrowUp"), D = () => keys.has("ArrowDown");

  function makeBuilding(wx) {
    const t = TKEYS[ri(TKEYS.length)], def = TYPES[t];
    const floors = def.squat ? 3 + ri(2) : t === "monolith" ? 9 + ri(4) : 5 + ri(7);
    const w = def.squat ? 110 + ri(40) : 60 + ri(50);
    const b = { wx, w, floors, intg: floors, max: floors, t, def, seed: ri(100), smashAt: 0, civs: [] };
    const n = 1 + ri(3);
    for (let i = 0; i < n; i++) b.civs.push({ floor: ri(floors), col: rf(0.2, 0.8), eaten: false });
    return b;
  }

  function reset() {
    state = {
      score: 0, district: 1, cleared: 0, over: false, choosing: false, offer: [], time: 0,
      nextUp: 2500, upInterval: 2500,
      buildings: [], nextWx: 130, enemies: [], shots: [], humans: [], debris: [], rubble: [], shocks: [],
      shake: 0, banner: 0, bannerText: "", spawnT: 3.2, civT: 2,
      mon: {
        wx: 90, y: 0, vx: 0, vy: 0, w: 46, h: 80, face: 1,
        grounded: true, onB: null, climbing: null, wallDir: 1, diving: false,
        atk: 0, atkType: null, atkHit: false, step: 0, eatCD: 0, hurt: 0,
        maxHp: 6, hp: 6, punchDmg: 3, poundDmg: 5, poundRange: 80, reach: 16,
        speed: 250, jumpV: 580, eatHeal: 1, scoreMult: 1, regen: 0, armor: 1,
      },
    };
    ensure(0);
  }
  const m = () => state.mon;
  function camX() { return Math.max(0, state.mon.wx + state.mon.w / 2 - W * 0.36); }
  function spawnNext() { const b = makeBuilding(state.nextWx); state.buildings.push(b); state.nextWx += b.w + 16 + ri(30); }
  function ensure(cx) {
    while (state.nextWx - cx < W + 320) spawnNext();
    for (let i = state.buildings.length - 1; i >= 0; i--) if (state.buildings[i].wx + state.buildings[i].w - cx < -120) state.buildings.splice(i, 1);
  }
  function roofY(b) { return Math.max(0, Math.ceil(b.intg)) * FLOOR_H; }
  function gain(n) { state.score += Math.round(n * state.mon.scoreMult); }

  /* ---------- input ---------- */
  function onKey(e) {
    const k = e.key;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "x", "X"].includes(k)) e.preventDefault();
    if (e.type === "keyup") { keys.delete(k); return; }
    keys.add(k);
    if (state.over) { if (k === " " || k === "Enter") reset(); return; }
    if (state.choosing) { if (k === "1" || k === "2" || k === "3") chooseUpgrade(+k - 1); return; }
    if (k === " ") punch();
    if (k === "x" || k === "X") pound();
    if (k === "ArrowUp") jump();
  }

  function jump() {
    const o = m();
    if (o.climbing) return;
    if (o.grounded) { o.vy = o.jumpV; o.grounded = false; o.onB = null; blip(420, 0.08, "square", 0.04); }
  }
  function punch() {
    const o = m(); if (o.atk > 0) return;
    let type = "punchF";
    if (U()) type = "punchU"; else if (D()) type = "punchD";
    else if ((o.face > 0 && L()) || (o.face < 0 && R())) type = "punchB";
    o.atk = 0.26; o.atkType = type; o.atkHit = false;
    blip(180, 0.05, "sawtooth", 0.035);
  }
  function pound() {
    const o = m(); if (o.atk > 0 || o.climbing) return;
    if (o.grounded) { o.atk = 0.3; o.atkType = "pound"; o.atkHit = false; }
    else { o.diving = true; }
  }

  /* ---------- attacks ---------- */
  function attackBox(o) {
    const f = o.face;
    switch (o.atkType) {
      case "punchU": return { x0: o.wx - 4, x1: o.wx + o.w + 4, y0: o.y + o.h * 0.5, y1: o.y + o.h + o.reach + 36 };
      case "punchD": return { x0: o.wx - 12, x1: o.wx + o.w + 12, y0: o.y - o.reach - 14, y1: o.y + o.h * 0.45 };
      case "punchB": return f > 0 ? { x0: o.wx - o.reach - 34, x1: o.wx, y0: 0, y1: o.y + o.h * 0.75 } : { x0: o.wx + o.w, x1: o.wx + o.w + o.reach + 34, y0: 0, y1: o.y + o.h * 0.75 };
      default: return f > 0 ? { x0: o.wx + o.w, x1: o.wx + o.w + o.reach + 34, y0: 0, y1: o.y + o.h * 0.75 } : { x0: o.wx - o.reach - 34, x1: o.wx, y0: 0, y1: o.y + o.h * 0.75 };
    }
  }
  function handPoint(o) {
    const b = attackBox(o);
    return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
  }
  function damageBuilding(b, dmg) {
    if (b.intg <= 0) return;
    const before = Math.ceil(b.intg);
    b.intg -= dmg / 3; b.smashAt = 0.18; state.shake = Math.max(state.shake, 0.08);
    const top = GROUND - roofY(b);
    for (let i = 0; i < 6; i++) state.debris.push({ wx: b.wx + rf(4, b.w - 4), y: rf(top, top + 30), vx: rf(-120, 120), vy: rf(-60, 220), life: rf(0.5, 1.1), c: b.def.win });
    gain(60 * (before - Math.ceil(b.intg)));
    // toppled civilians flee
    for (const c of b.civs) if (!c.eaten && c.floor >= Math.ceil(b.intg)) { c.eaten = true; state.humans.push({ wx: b.wx + c.col * b.w, y: roofY(b) + 6, vx: 0, vy: 40, state: "fall" }); }
    if (b.intg <= 0) {
      b.intg = 0; gain(300); state.cleared++; state.shake = 0.24;
      state.rubble.push({ wx: b.wx, w: b.w, seed: b.seed });
      blip(700, 0.2, "square", 0.06);
      if (state.cleared % 4 === 0) { state.district++; state.banner = 2.2; state.bannerText = "DISTRICT " + state.district; blip(1046, 0.3, "triangle", 0.07); }
    }
  }
  function hitEnemy(e, dmg) {
    if (e.dead) return;
    e.hp -= dmg; e.flash = 0.12;
    if (e.hp <= 0) { e.dead = true; gain(e.score); for (let i = 0; i < 6; i++) state.debris.push({ wx: e.wx, y: GROUND - e.y, vx: rf(-100, 100), vy: rf(-150, -20), life: rf(0.4, 0.9), c: "#ff7ac6" }); blip(300, 0.1, "square", 0.05); }
  }
  function applyAttack() {
    const o = m();
    if (o.atkType === "pound" || o.atkType === "airpound") {
      const air = o.atkType === "airpound";
      const range = air ? o.poundRange * 1.7 : o.poundRange;
      const dmg = air ? o.poundDmg * 2 : o.poundDmg;
      const fx = o.wx + o.w / 2;
      state.shocks.push({ x: fx, y: o.y, r: 12, max: range, t: 0.45 });
      state.shake = air ? 0.36 : 0.2;
      blip(air ? 60 : 90, 0.28, "square", 0.07);
      for (const b of state.buildings) if (b.intg > 0 && b.wx < fx + range && b.wx + b.w > fx - range) damageBuilding(b, dmg);
      for (const e of state.enemies) if (!e.dead && Math.abs(e.wx - fx) < range && e.y < o.y + 50) hitEnemy(e, dmg * 3);
    } else {
      const b = attackBox(o);
      for (const bl of state.buildings) if (bl.intg > 0 && b.x1 > bl.wx && b.x0 < bl.wx + bl.w && b.y0 < roofY(bl)) { damageBuilding(bl, o.punchDmg); break; }
      for (const e of state.enemies) { if (e.dead) continue; const ec = e.wx + (e.w || 0) / 2, eh = e.h || 16; if (ec > b.x0 - 10 && ec < b.x1 + 10 && e.y + eh > b.y0 && e.y < b.y1) hitEnemy(e, o.punchDmg); }
    }
  }

  /* ---------- enemies ---------- */
  function enemyPool() {
    const d = state.district, p = ["soldier"];
    if (d >= 2) p.push("humvee", "heli");
    if (d >= 3) p.push("plane");
    if (d >= 4) p.push("tank", "heli");
    return p;
  }
  function spawnEnemy() {
    const cx = camX(), o = m(), kind = enemyPool()[ri(enemyPool().length)];
    const fromLeft = o.wx > cx + W / 2 ? true : Math.random() < 0.5;
    const sx = fromLeft ? cx - 30 : cx + W + 30, dir = fromLeft ? 1 : -1;
    const base = { wx: sx, dir, flash: 0, fire: rf(0.6, 1.6), dead: false };
    if (kind === "soldier") Object.assign(base, { kind, w: 14, h: 22, y: 0, hp: 1, spd: 46, score: 150, dmg: 1, rate: 2.4 });
    else if (kind === "humvee") Object.assign(base, { kind, w: 44, h: 24, y: 0, hp: 4, spd: 90, score: 350, dmg: 1, rate: 1.5 });
    else if (kind === "tank") Object.assign(base, { kind, w: 60, h: 30, y: 0, hp: 8, spd: 40, score: 750, dmg: 2, rate: 2.4 });
    else if (kind === "heli") Object.assign(base, { kind, w: 38, h: 16, y: 150 + rf(0, 80), hp: 2, spd: 70, score: 400, dmg: 1, rate: 1.6, bob: rf(0, 6) });
    else Object.assign(base, { kind: "plane", w: 46, h: 14, y: 220 + rf(0, 60), hp: 2, spd: 230, score: 450, dmg: 1, rate: 0.9 });
    state.enemies.push(base);
  }
  function enemyFire(e) {
    const o = m(), tx = o.wx + o.w / 2, ty = o.y + o.h * 0.5;
    const ex = e.wx + e.w / 2, ey = e.y + e.h / 2;
    if (e.kind === "heli" || e.kind === "plane") { state.shots.push({ wx: ex, y: e.y, vx: e.kind === "plane" ? e.dir * 60 : 0, vy: -150, dmg: e.dmg, big: false, bomb: true }); return; }
    // imperfect aim — lead error grows for small-arms so a moving kaiju can dodge
    const err = e.kind === "tank" ? 30 : 70;
    const dx = tx + rf(-err, err) - ex, dy = ty + rf(-err * 0.6, err * 0.6) - ey, len = Math.hypot(dx, dy) || 1;
    const spd = e.kind === "tank" ? 210 : 200;
    state.shots.push({ wx: ex, y: ey, vx: (dx / len) * spd, vy: (dy / len) * spd, dmg: e.dmg, big: e.kind === "tank" });
  }

  /* ---------- upgrades ---------- */
  function offerUpgrades() {
    state.choosing = true;
    const pool = UPGRADES.slice(); state.offer = [];
    for (let i = 0; i < 3; i++) state.offer.push(pool.splice(ri(pool.length), 1)[0]);
    blip(880, 0.18, "triangle", 0.06);
  }
  function chooseUpgrade(i) {
    const u = state.offer[i]; if (!u) return;
    u.fn(state.mon); state.choosing = false;
    state.upInterval = Math.round(state.upInterval * 1.1);
    state.nextUp = state.score + state.upInterval;
    blip(660, 0.12, "square", 0.05);
  }

  /* ---------- update ---------- */
  function update(dt) {
    if (state.over || state.choosing) return;
    state.time += dt;
    const o = m(), cx0 = camX();

    // attack timing
    if (o.atk > 0) { o.atk -= dt; if (!o.atkHit && o.atk < 0.16) { o.atkHit = true; applyAttack(); } }
    if (o.eatCD > 0) o.eatCD -= dt;
    if (o.hurt > 0) o.hurt -= dt;
    if (state.shake > 0) state.shake -= dt;
    if (state.banner > 0) state.banner -= dt;
    if (o.regen) o.hp = Math.min(o.maxHp, o.hp + o.regen * dt);

    const dir = (R() ? 1 : 0) - (L() ? 1 : 0);
    if (o.climbing) {
      const b = o.climbing;
      if (b.intg <= 0) { o.climbing = null; o.grounded = false; }
      else {
        const top = roofY(b);
        const v = (U() ? 1 : 0) - (D() ? 1 : 0);
        o.y = clamp(o.y + v * 170 * dt, 0, top);
        o.wx = o.wallDir > 0 ? b.wx - o.w + 3 : b.wx + b.w - 3;
        o.face = o.wallDir;
        o.step += dt * 6;
        if (o.y <= 0) { o.climbing = null; o.grounded = true; }
        else if (o.y >= top) { o.climbing = null; o.grounded = true; o.onB = b; o.y = top; }
        else if (dir === -o.wallDir) { o.climbing = null; o.grounded = false; o.vy = 160; o.wx += dir * 6; }
      }
    } else {
      o.wx += dir * o.speed * dt;
      if (dir) o.face = dir;
      o.wx = Math.max(20, o.wx);
      o.step = dir && o.grounded ? o.step + dt * 11 : 0;
      // gravity
      if (!o.grounded) { o.vy -= (o.diving ? 2600 : 1500) * dt; o.y += o.vy * dt; }
      // support
      const cx = o.wx + o.w / 2; let support = 0, onB = null;
      for (const b of state.buildings) {
        if (b.intg <= 0) continue;
        if (cx > b.wx + 3 && cx < b.wx + b.w - 3) { const r = roofY(b); if (o.y <= r + 2 && o.y >= r - 44 && r > support) { support = r; onB = b; } }
      }
      if (o.vy <= 0 && o.y <= support + 1 && (support > 0 ? onB : true)) {
        const wasDiving = o.diving;
        o.y = support; o.vy = 0; o.grounded = true; o.onB = support > 0 ? onB : null; o.diving = false;
        if (wasDiving) { o.atk = 0.34; o.atkType = "airpound"; o.atkHit = false; }
      } else if (o.y <= 0 && o.vy <= 0) {
        const wasDiving = o.diving; o.y = 0; o.vy = 0; o.grounded = true; o.onB = null; o.diving = false;
        if (wasDiving) { o.atk = 0.34; o.atkType = "airpound"; o.atkHit = false; }
      } else o.grounded = false;
      // cling to a wall
      if (!o.grounded && dir !== 0) {
        for (const b of state.buildings) {
          if (b.intg <= 0) continue; const top = roofY(b); if (o.y >= top - 4) continue;
          if (dir > 0 && Math.abs(o.wx + o.w - b.wx) < 16) { o.climbing = b; o.wallDir = 1; o.vy = 0; o.wx = b.wx - o.w + 3; break; }
          if (dir < 0 && Math.abs(o.wx - (b.wx + b.w)) < 16) { o.climbing = b; o.wallDir = -1; o.vy = 0; o.wx = b.wx + b.w - 3; break; }
        }
      }
    }

    const cx = camX();
    ensure(cx);

    // spawn enemies (gentle at district 1, ramps up as you advance)
    state.spawnT -= dt;
    const enemyCap = Math.min(9, 2 + state.district);
    if (state.spawnT <= 0 && state.enemies.filter((e) => !e.dead).length < enemyCap) {
      state.spawnT = Math.max(0.7, 2.4 - state.district * 0.16) + rf(0, 0.9);
      spawnEnemy();
    }
    // spawn civilians on buildings near view
    state.civT -= dt;
    if (state.civT <= 0) { state.civT = rf(2, 4); const near = state.buildings.filter((b) => b.intg > 0 && b.wx - cx > -50 && b.wx - cx < W); const b = near[ri(near.length)]; if (b && b.civs.filter((c) => !c.eaten).length < 4) b.civs.push({ floor: ri(Math.max(1, Math.ceil(b.intg))), col: rf(0.2, 0.8), eaten: false }); }

    // enemies AI
    for (const e of state.enemies) {
      if (e.dead) continue;
      if (e.flash > 0) e.flash -= dt;
      if (e.kind === "plane") { e.wx += e.dir * e.spd * dt; }
      else if (e.kind === "heli") { const tx = o.wx + (o.face > 0 ? 60 : -60); e.wx += Math.sign(tx - e.wx) * Math.min(e.spd * dt, Math.abs(tx - e.wx)); }
      else {
        // ground units advance but hold a standoff distance and shoot from range
        const standoff = e.kind === "tank" ? 190 : e.kind === "humvee" ? 150 : 110;
        const gap = o.wx - e.wx, dist = Math.abs(gap);
        if (dist > standoff) e.wx += Math.sign(gap) * Math.min(e.spd * dt, dist - standoff);
        else if (dist < standoff - 40) e.wx -= Math.sign(gap) * e.spd * 0.6 * dt; // back away from the kaiju
      }
      e.fire -= dt;
      const onScreen = e.wx - cx > -20 && e.wx - cx < W + 20;
      if (e.fire <= 0 && onScreen) { e.fire = e.rate + rf(0, 0.6); enemyFire(e); }
    }
    state.enemies = state.enemies.filter((e) => !e.dead && e.wx - cx > -120 && e.wx - cx < W + 120);

    // shots (vy is in altitude space: positive = up, negative = falling)
    const hb = { x0: o.wx, x1: o.wx + o.w, y0: o.y, y1: o.y + o.h };
    for (const s of state.shots) { s.wx += (s.vx || 0) * dt; s.y += (s.vy || 0) * dt; }
    for (const s of state.shots) {
      const sxw = s.wx, syw = s.y;
      if (sxw > hb.x0 - 4 && sxw < hb.x1 + 4 && syw > hb.y0 - 4 && syw < hb.y1 + 4 && o.hurt <= 0) {
        o.hp -= Math.max(0.5, s.dmg * o.armor); o.hurt = 1.1; state.shake = 0.18; s.hit = true; blip(70, 0.2, "sawtooth", 0.05);
        if (o.hp <= 0) end();
      }
    }
    state.shots = state.shots.filter((s) => !s.hit && s.y > -40 && s.y < H + 80 && s.wx - cx > -60 && s.wx - cx < W + 60);

    // humans
    for (const h of state.humans) {
      if (h.state === "fall") { h.vy += 900 * dt; h.y -= h.vy * dt; if (h.y <= 0) { h.y = 0; h.state = "run"; h.vx = (h.wx < o.wx ? -1 : 1) * 70; } }
      else if (h.state === "run") h.wx += h.vx * dt;
    }
    state.humans = state.humans.filter((h) => h.wx - cx > -80 && h.wx - cx < W + 80);
    // building-perched civilians + eating
    if (o.eatCD <= 0) {
      // eat free humans
      for (const h of state.humans) { if (Math.abs((h.wx) - (o.wx + o.w / 2)) < o.w / 2 + 8 && Math.abs(h.y - o.y) < o.h) { eat(); h.gone = true; break; } }
      state.humans = state.humans.filter((h) => !h.gone);
      // eat perched civilians when body overlaps
      if (o.eatCD <= 0) for (const b of state.buildings) {
        if (b.intg <= 0) continue;
        for (const c of b.civs) { if (c.eaten) continue; const hx = b.wx + c.col * b.w, hy = (c.floor + 0.5) * FLOOR_H; if (Math.abs(hx - (o.wx + o.w / 2)) < o.w / 2 + 10 && Math.abs(hy - (o.y + o.h * 0.5)) < o.h * 0.6) { c.eaten = true; eat(); break; } }
        if (o.eatCD > 0) break;
      }
    }

    // debris & shocks
    for (const d of state.debris) { d.vy += 600 * dt; d.wx += d.vx * dt; d.y += d.vy * dt; d.life -= dt; }
    state.debris = state.debris.filter((d) => d.life > 0);
    if (state.debris.length > 140) state.debris.splice(0, state.debris.length - 140);
    for (const s of state.shocks) { s.r += (s.max - s.r) * 8 * dt; s.t -= dt; }
    state.shocks = state.shocks.filter((s) => s.t > 0);
    for (const b of state.buildings) if (b.smashAt > 0) b.smashAt -= dt;

    // roguelite gate
    if (!state.choosing && state.score >= state.nextUp) offerUpgrades();
  }
  function eat() { const o = m(); gain(120); o.hp = Math.min(o.maxHp, o.hp + o.eatHeal); o.eatCD = 0.25; blip(523 + ri(200), 0.1, "triangle", 0.06); }
  function end() { if (!state.over) { state.over = true; onEnd(state.score); } }

  /* ---------- drawing ---------- */
  function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
  function drawBuilding(b, sx) {
    if (b.intg <= 0) return;
    const def = b.def, floors = Math.ceil(b.intg), h = floors * FLOOR_H, top = GROUND - h;
    const wob = b.smashAt > 0 ? Math.sin(b.smashAt * 60) * 1.5 : 0;
    rect(sx + wob, top, b.w, h, def.body); rect(sx + wob, top, 3, h, def.edge); rect(sx + wob + b.w - 3, top, 3, h, "#000");
    const cols = Math.max(1, Math.floor((b.w - 14) / 15));
    for (let f = 0; f < floors; f++) { const wy = top + f * FLOOR_H + 6; for (let c = 0; c < cols; c++) { const lit = (f * 7 + c * 5 + b.seed) % 4 !== 0; rect(sx + wob + 9 + c * 15, wy, 8, 12, lit ? def.win : def.off); } }
    // perched civilians (little figures in windows)
    for (const c of b.civs) { if (c.eaten || c.floor >= floors) continue; const hx = sx + wob + c.col * b.w, hy = GROUND - (c.floor + 1) * FLOOR_H + 8; rect(hx, hy, 4, 7, "#ffd7b0"); rect(hx, hy + 7, 4, 4, "#2ee6ff"); }
    const rx = sx + wob;
    if (def.roof === "antenna") { rect(rx + b.w / 2, top - 14, 2, 14, "#6b7790"); rect(rx + b.w / 2 - 2, top - 16, 6, 4, "#ff5a5a"); }
    if (def.roof === "tank") { rect(rx + b.w - 26, top - 13, 16, 9, "#3a4a63"); rect(rx + b.w - 24, top - 4, 3, 4, "#3a4a63"); rect(rx + b.w - 15, top - 4, 3, 4, "#3a4a63"); }
    if (def.roof === "ac") { rect(rx + 10, top - 7, 12, 7, "#2d313c"); rect(rx + 26, top - 5, 9, 5, "#2d313c"); }
    if (def.roof === "stack") { rect(rx + 12, top - 18, 9, 18, "#1d1d12"); const pf = (state.time * 1.4) % 1; ctx.fillStyle = "rgba(180,180,170,0.22)"; ctx.beginPath(); ctx.arc(rx + 16, top - 20 - pf * 8, 5 + pf * 3, 0, 7); ctx.fill(); }
    if (def.label) { ctx.fillStyle = def.win; ctx.font = "bold 9px monospace"; ctx.textAlign = "center"; ctx.fillText(def.label, rx + b.w / 2, top - 20); }
  }
  function drawRubble(r, sx) { ctx.fillStyle = "#1a1f30"; for (let i = 0; i < r.w; i += 9) { const hh = 6 + ((i + r.seed) % 14); ctx.fillRect(sx + i, GROUND - hh, 8, hh); } }

  function drawEnemy(e, sx) {
    const ey = GROUND - e.y - e.h;
    ctx.save(); if (e.flash > 0) ctx.globalAlpha = 0.5;
    if (e.kind === "soldier") { rect(sx + 3, ey + 6, 8, 14, "#3a5a3a"); rect(sx + 4, ey, 6, 6, "#2a4a2a"); rect(sx + 10, ey + 8, 8, 3, "#1a1a1a"); }
    else if (e.kind === "humvee") { rect(sx, ey + 8, e.w, 12, "#4a5a3a"); rect(sx + 8, ey, 22, 10, "#3a4a2a"); rect(sx + e.w - 14, ey + 4, 16, 3, "#1a1a1a"); ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(sx + 10, ey + 21, 4, 0, 7); ctx.arc(sx + e.w - 10, ey + 21, 4, 0, 7); ctx.fill(); }
    else if (e.kind === "tank") { rect(sx, ey + 14, e.w, 14, "#566b3a"); rect(sx + 10, ey + 4, 30, 12, "#46592f"); rect(sx + (e.dir > 0 ? e.w - 6 : -16), ey + 7, 22, 4, "#2a2a1a"); ctx.fillStyle = "#1a1a1a"; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(sx + 8 + i * 11, ey + 28, 4, 0, 7); ctx.fill(); } }
    else if (e.kind === "heli") { rect(sx, ey + 4, e.w, 9, "#5a5a6a"); rect(sx + e.w - 6, ey + 6, 12, 3, "#5a5a6a"); rect(sx - 10, ey, e.w + 22, 2, "#9aa"); rect(sx + 4, ey + 13, 3, 5, "#5a5a6a"); }
    else { rect(sx, ey + 4, e.w, 7, "#7a8596"); rect(sx + (e.dir > 0 ? e.w - 4 : -10), ey + 5, 14, 4, "#7a8596"); rect(sx + 10, ey - 4, 16, 5, "#9aa6b8"); }
    ctx.restore();
    if (e.hp < (e.maxhp || 99) && e.kind !== "soldier") {}
  }

  function drawMonster(sx, base) {
    const o = m(), top = GROUND - o.y - o.h;
    ctx.save();
    if (o.hurt > 0 && Math.floor(o.hurt * 20) % 2) ctx.globalAlpha = 0.55;
    if (o.face < 0) { ctx.translate(sx + o.w, 0); ctx.scale(-1, 1); ctx.translate(-sx, 0); }
    const climbing = !!o.climbing, jumping = !o.grounded && !climbing;
    // legs
    const lp = o.step;
    if (climbing) { rect(sx + 12, top + o.h - 14, 9, 14, "#1f9e74"); rect(sx + o.w - 21, top + o.h - 14 - Math.sin(lp) * 5, 9, 14, "#1f9e74"); }
    else if (jumping) { rect(sx + 13, top + o.h - 12, 9, 12, "#1f9e74"); rect(sx + o.w - 22, top + o.h - 12, 9, 12, "#1f9e74"); }
    else { rect(sx + 12, top + o.h - 12 - Math.max(0, Math.sin(lp)) * 4, 9, 12, "#1f9e74"); rect(sx + o.w - 21, top + o.h - 12 - Math.max(0, -Math.sin(lp)) * 4, 9, 12, "#1f9e74"); }
    // tail
    rect(sx - 6, top + 34, 10, 6, "#2bbf8c");
    // body + belly
    rect(sx + 8, top + 18, o.w - 16, o.h - 28, "#36f9b3"); rect(sx + 15, top + 26, o.w - 30, o.h - 42, "#bdffe6");
    // head
    rect(sx + 11, top, o.w - 22, 22, "#2ee6ff");
    ctx.fillStyle = "#e7ecf5"; ctx.beginPath(); ctx.moveTo(sx + 13, top); ctx.lineTo(sx + 8, top - 8); ctx.lineTo(sx + 19, top); ctx.fill();
    ctx.beginPath(); ctx.moveTo(sx + o.w - 19, top); ctx.lineTo(sx + o.w - 8, top - 8); ctx.lineTo(sx + o.w - 13, top); ctx.fill();
    rect(sx + 16, top + 6, 5, 6, "#04121a"); rect(sx + o.w - 22, top + 6, 5, 6, "#04121a");
    rect(sx + 17, top + 7, 2, 2, "#fff"); rect(sx + o.w - 21, top + 7, 2, 2, "#fff");
    // mouth when eating
    if (o.eatCD > 0.12) { rect(sx + 18, top + 14, o.w - 36, 6, "#04121a"); }
    // arms by attack type
    const armC = "#2ee6ff", fist = "#bdffe6";
    const drawArm = (ax, ay, aw, ah) => { rect(ax, ay, aw, ah, armC); };
    if (o.atk > 0 && o.atkType && o.atkType.startsWith("punch")) {
      const ext = o.reach + 10;
      if (o.atkType === "punchU") { drawArm(sx + o.w / 2 - 5, top - ext, 10, ext); rect(sx + o.w / 2 - 6, top - ext - 5, 12, 7, fist); }
      else if (o.atkType === "punchD") { drawArm(sx + o.w / 2 - 5, top + o.h, 10, ext); rect(sx + o.w / 2 - 6, top + o.h + ext - 2, 12, 7, fist); }
      else if (o.atkType === "punchB") { drawArm(sx - ext, top + 24, ext, 9); rect(sx - ext - 4, top + 22, 7, 13, fist); }
      else { drawArm(sx + o.w - 4, top + 24, ext, 9); rect(sx + o.w - 4 + ext, top + 22, 7, 13, fist); }
    } else if ((o.atkType === "pound" || o.atkType === "airpound") && o.atk > 0) {
      rect(sx + 2, top + o.h - 6, 12, 10, armC); rect(sx + o.w - 14, top + o.h - 6, 12, 10, armC);
    } else if (climbing) {
      rect(sx + o.w - 6, top + 6 + Math.sin(o.step) * 4, 10, 9, armC); rect(sx + o.w - 6, top + 30 - Math.sin(o.step) * 4, 10, 9, armC);
    } else if (jumping) { rect(sx + o.w - 6, top + 12, 9, 9, armC); rect(sx + 1, top + 12, 9, 9, armC); }
    else { rect(sx + o.w - 7, top + 24, 8, 16, armC); rect(sx, top + 24, 8, 16, armC); }
    ctx.restore();
    if (o.atk > 0.12 && o.atkType && o.atkType.startsWith("punch")) { ctx.fillStyle = "#ffd25a"; ctx.font = "bold 13px monospace"; ctx.textAlign = "center"; const hp2 = handPoint(o); ctx.fillText("POW", hp2.x - camX(), GROUND - hp2.y); }
  }

  function draw() {
    const cx = camX();
    ctx.save();
    if (state.shake > 0) ctx.translate(rf(-3.5, 3.5), rf(-2.5, 2.5));
    // sky
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#0b1026"); g.addColorStop(0.6, "#0a0f22"); g.addColorStop(1, "#04060e"); rect(0, 0, W, H, g);
    // moon
    ctx.fillStyle = "rgba(180,210,255,0.5)"; ctx.beginPath(); ctx.arc(W - 120, 80, 34, 0, 7); ctx.fill();
    ctx.fillStyle = "#0b1026"; ctx.beginPath(); ctx.arc(W - 108, 72, 30, 0, 7); ctx.fill();
    // stars
    ctx.fillStyle = "rgba(46,230,255,0.5)"; for (let i = 0; i < 60; i++) ctx.fillRect((i * 151) % W, (i * 47) % 150, 1, 1);
    // far parallax skyline (slow)
    let px = cx * 0.25;
    for (let x = -(px % 110); x < W + 110; x += 110) { const wx = x + px; const h = 70 + 50 * Math.abs(Math.sin(wx * 0.008)); rect(x, GROUND - h, 108, h, "#0a1126"); }
    // near parallax skyline
    px = cx * 0.45;
    for (let x = -(px % 84); x < W + 84; x += 84) { const wx = x + px; const h = 50 + 40 * Math.abs(Math.sin(wx * 0.013 + 1)); rect(x, GROUND - h, 82, h, "#0d1730"); ctx.fillStyle = "rgba(120,150,210,0.12)"; for (let wy = GROUND - h + 8; wy < GROUND - 6; wy += 14) ctx.fillRect(x + 8, wy, 5, 6); }

    for (const r of state.rubble) drawRubble(r, r.wx - cx);
    for (const b of state.buildings) drawBuilding(b, b.wx - cx);

    // ground
    rect(0, GROUND, W, H - GROUND, "#0b0f1c");
    ctx.fillStyle = "#1c2540"; for (let x = -(cx % 40); x < W; x += 40) ctx.fillRect(x, GROUND, 16, 3);
    for (let lx = Math.floor(cx / 180) * 180; lx - cx < W; lx += 180) { const s = lx - cx; rect(s, GROUND - 24, 2, 24, "#3a4660"); rect(s - 3, GROUND - 26, 8, 3, "#ffd25a"); }

    // shockwaves
    for (const s of state.shocks) { ctx.strokeStyle = `rgba(255,210,90,${s.t})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(s.x - cx, GROUND - s.y, s.r, 0, 7); ctx.stroke(); }
    // running humans
    for (const h of state.humans) { const sx = h.wx - cx, sy = GROUND - h.y; rect(sx, sy - 11, 4, 7, "#ffd7b0"); rect(sx, sy - 4, 4, 4, h.state === "run" ? "#ff7ac6" : "#2ee6ff"); }
    // debris
    for (const d of state.debris) rect(d.wx - cx, GROUND - d.y, 4, 4, d.c || "#9fb6d4");
    // enemies (ground first then air drawn after for layering is fine)
    for (const e of state.enemies) if (!e.dead) drawEnemy(e, e.wx - cx);
    // monster
    drawMonster(state.mon.wx - cx, state.time);
    // shots
    for (const s of state.shots) { ctx.fillStyle = s.big ? "#ff9a3a" : s.bomb ? "#ff5a5a" : "#ffe05a"; ctx.beginPath(); ctx.arc(s.wx - cx, GROUND - s.y, s.big ? 5 : 3, 0, 7); ctx.fill(); }
    ctx.restore();

    // HUD
    ctx.textAlign = "left"; ctx.font = "bold 15px monospace"; ctx.fillStyle = "#e7ecf5"; ctx.fillText("SCORE " + state.score, 14, 26);
    ctx.font = "11px monospace"; ctx.fillStyle = "#8b94a8"; ctx.fillText("next upgrade @ " + state.nextUp, 14, 42);
    ctx.textAlign = "center"; ctx.font = "bold 15px monospace"; ctx.fillStyle = "#a855f7"; ctx.fillText("DISTRICT " + state.district, W / 2, 26);
    // HP bar
    const o = m(); ctx.textAlign = "right"; ctx.font = "bold 13px monospace"; ctx.fillStyle = "#ff5a5a";
    let hearts = ""; for (let i = 0; i < Math.ceil(o.maxHp); i++) hearts += i < Math.round(o.hp) ? "♥" : "·";
    ctx.fillText("HP " + hearts, W - 14, 26);

    if (state.banner > 0) { ctx.globalAlpha = Math.min(1, state.banner); ctx.textAlign = "center"; ctx.fillStyle = "#a855f7"; ctx.font = "bold 32px monospace"; ctx.fillText(state.bannerText, W / 2, H / 2 - 40); ctx.fillStyle = "#36f9b3"; ctx.font = "12px monospace"; ctx.fillText("BLOCK CLEARED — advance right →", W / 2, H / 2 - 16); ctx.globalAlpha = 1; }

    if (state.choosing) drawUpgrades();
    if (state.over) {
      ctx.fillStyle = "rgba(4,6,14,0.85)"; ctx.fillRect(0, 0, W, H); ctx.textAlign = "center";
      ctx.fillStyle = "#ff7ac6"; ctx.font = "bold 38px monospace"; ctx.fillText("GAME OVER", W / 2, H / 2 - 16);
      ctx.fillStyle = "#e7ecf5"; ctx.font = "16px monospace"; ctx.fillText("SCORE " + state.score + " · DISTRICT " + state.district, W / 2, H / 2 + 14);
      ctx.fillStyle = "#8b94a8"; ctx.font = "12px monospace"; ctx.fillText("press SPACE to play again", W / 2, H / 2 + 44);
    }
  }
  function drawUpgrades() {
    ctx.fillStyle = "rgba(4,6,14,0.88)"; ctx.fillRect(0, 0, W, H); ctx.textAlign = "center";
    ctx.fillStyle = "#36f9b3"; ctx.font = "bold 26px monospace"; ctx.fillText("◆ LEVEL UP ◆", W / 2, 110);
    ctx.fillStyle = "#8b94a8"; ctx.font = "12px monospace"; ctx.fillText("press 1 · 2 · 3 to choose a mutation", W / 2, 134);
    const cw = 240, gap = 26, total = cw * 3 + gap * 2, x0 = (W - total) / 2, cy = 180, ch = 170;
    const cols = ["#2ee6ff", "#a855f7", "#36f9b3"];
    state.offer.forEach((u, i) => {
      const x = x0 + i * (cw + gap);
      ctx.fillStyle = "#10162a"; ctx.fillRect(x, cy, cw, ch);
      ctx.strokeStyle = cols[i]; ctx.lineWidth = 2; ctx.strokeRect(x, cy, cw, ch);
      ctx.fillStyle = cols[i]; ctx.font = "bold 34px monospace"; ctx.fillText(i + 1, x + cw / 2, cy + 52);
      ctx.fillStyle = "#e7ecf5"; ctx.font = "bold 16px monospace"; ctx.fillText(u.name, x + cw / 2, cy + 96);
      ctx.fillStyle = "#8b94a8"; ctx.font = "12px monospace"; ctx.fillText(u.desc, x + cw / 2, cy + 122);
    });
  }
  // click-to-pick upgrades
  function onClick(ev) {
    if (!state.choosing) return;
    const rectc = canvas.getBoundingClientRect();
    const x = ((ev.clientX - rectc.left) / rectc.width) * W;
    const y = ((ev.clientY - rectc.top) / rectc.height) * H;
    const cw = 240, gap = 26, total = cw * 3 + gap * 2, x0 = (W - total) / 2, cy = 180, ch = 170;
    if (y < cy || y > cy + ch) return;
    for (let i = 0; i < 3; i++) { const cx = x0 + i * (cw + gap); if (x > cx && x < cx + cw) { chooseUpgrade(i); return; } }
  }

  function loop(now) { const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now; update(dt); draw(); if (running) raf = requestAnimationFrame(loop); }

  return {
    start() { reset(); running = true; last = performance.now(); window.addEventListener("keydown", onKey); window.addEventListener("keyup", onKey); canvas.addEventListener("click", onClick); raf = requestAnimationFrame(loop); },
    stop() { running = false; cancelAnimationFrame(raf); window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKey); canvas.removeEventListener("click", onClick); },
  };
}
