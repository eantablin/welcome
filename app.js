/* ============================================================
   Emanuel Antablin — shared site behavior
   Vanilla JS, no dependencies. Guards every feature so the
   same file works on every page.
   ============================================================ */
(function () {
    'use strict';

    var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var root = document.documentElement;
    var $ = function (s, c) { return (c || document).querySelector(s); };
    var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

    /* ---------- Footer year ---------- */
    $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });

    /* ---------- Nav: scroll state + mobile menu + active link ---------- */
    var nav = $('.nav');
    if (nav) {
        var onScroll = function () { nav.classList.toggle('scrolled', window.scrollY > 8); };
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
    }
    var navToggle = $('.nav-toggle');
    if (navToggle) {
        navToggle.addEventListener('click', function () {
            var open = document.body.classList.toggle('menu-open');
            navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        $$('.nav-links a').forEach(function (a) {
            a.addEventListener('click', function () { document.body.classList.remove('menu-open'); navToggle.setAttribute('aria-expanded', 'false'); });
        });
    }

    /* ---------- Theme toggle (dark default <-> light) ---------- */
    var themeToggle = $('#themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', function () {
            var isLight = root.getAttribute('data-theme') === 'light';
            if (isLight) { root.removeAttribute('data-theme'); localStorage.removeItem('theme'); }
            else { root.setAttribute('data-theme', 'light'); localStorage.setItem('theme', 'light'); }
            if (fxActive) { stopFx(); startFx(); }
        });
    }

    /* ---------- Scroll reveal ---------- */
    var revealEls = $$('.reveal');
    if (revealEls.length) {
        if (prefersReduced || !('IntersectionObserver' in window)) {
            revealEls.forEach(function (el) { el.classList.add('in'); });
        } else {
            var io = new IntersectionObserver(function (entries) {
                entries.forEach(function (e) {
                    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
                });
            }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
            revealEls.forEach(function (el) { io.observe(el); });
        }
    }

    /* ---------- Animated stat counters ---------- */
    var counters = $$('[data-count]');
    if (counters.length) {
        var runCount = function (el) {
            var target = parseFloat(el.getAttribute('data-count'));
            var dec = (el.getAttribute('data-count').split('.')[1] || '').length;
            var dur = 1400, start = null;
            var prefix = el.getAttribute('data-prefix') || '';
            var suffix = el.getAttribute('data-suffix') || '';
            if (prefersReduced) { el.textContent = prefix + target.toFixed(dec) + suffix; return; }
            var step = function (ts) {
                if (!start) start = ts;
                var p = Math.min((ts - start) / dur, 1);
                var eased = 1 - Math.pow(1 - p, 3);
                el.textContent = prefix + (target * eased).toFixed(dec) + suffix;
                if (p < 1) requestAnimationFrame(step);
                else el.textContent = prefix + target.toFixed(dec) + suffix;
            };
            requestAnimationFrame(step);
        };
        if (!('IntersectionObserver' in window)) {
            counters.forEach(runCount);
        } else {
            var cio = new IntersectionObserver(function (entries) {
                entries.forEach(function (e) { if (e.isIntersecting) { runCount(e.target); cio.unobserve(e.target); } });
            }, { threshold: 0.6 });
            counters.forEach(function (el) { cio.observe(el); });
        }
    }

    /* ---------- Skill card click-to-flip (touch friendly) ---------- */
    $$('.skill-card-wrapper').forEach(function (w) {
        w.setAttribute('tabindex', '0');
        w.setAttribute('role', 'button');
        var flip = function () { w.classList.toggle('flipped'); };
        w.addEventListener('click', flip);
        w.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
    });

    /* ---------- Copy email ---------- */
    $$('[data-copy]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var val = btn.getAttribute('data-copy');
            var done = function () {
                var label = btn.querySelector('[data-copy-label]') || btn;
                var prev = label.textContent;
                btn.classList.add('copied'); label.textContent = 'Copied ✓';
                setTimeout(function () { btn.classList.remove('copied'); label.textContent = prev; }, 1600);
            };
            if (navigator.clipboard) { navigator.clipboard.writeText(val).then(done, done); }
            else { done(); }
        });
    });

    /* ---------- Typing effect (hero) ---------- */
    var typed = $('#typed');
    if (typed && !prefersReduced) {
        var phrases = (typed.getAttribute('data-phrases') || '').split('|').filter(Boolean);
        if (phrases.length) {
            var caret = document.createElement('span');
            caret.className = 'caret';
            typed.parentNode.insertBefore(caret, typed.nextSibling);
            var pi = 0, ci = 0, deleting = false;
            var tick = function () {
                var word = phrases[pi];
                ci += deleting ? -1 : 1;
                typed.textContent = word.slice(0, ci);
                var delay = deleting ? 38 : 70;
                if (!deleting && ci === word.length) { delay = 1500; deleting = true; }
                else if (deleting && ci === 0) { deleting = false; pi = (pi + 1) % phrases.length; delay = 320; }
                setTimeout(tick, delay);
            };
            setTimeout(tick, 600);
        }
    } else if (typed) {
        var ph = (typed.getAttribute('data-phrases') || '').split('|').filter(Boolean);
        if (ph.length) typed.textContent = ph[0];
    }

    /* ============================================================
       Hero neural-network canvas
       ============================================================ */
    var heroCanvas = $('#heroCanvas');
    if (heroCanvas && !prefersReduced) {
        var hctx = heroCanvas.getContext('2d');
        var nodes = [], W, H, dpr, mouse = { x: -9999, y: -9999 };
        var accent = function () {
            return getComputedStyle(root).getPropertyValue('--cyan').trim() || '#2ee6ff';
        };
        var resizeHero = function () {
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            W = heroCanvas.clientWidth; H = heroCanvas.clientHeight;
            heroCanvas.width = W * dpr; heroCanvas.height = H * dpr;
            hctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            var count = Math.min(Math.round(W * H / 16000), window.innerWidth < 760 ? 36 : 84);
            nodes = [];
            for (var i = 0; i < count; i++) {
                nodes.push({
                    x: Math.random() * W, y: Math.random() * H,
                    vx: (Math.random() - 0.5) * 0.32, vy: (Math.random() - 0.5) * 0.32,
                    r: Math.random() * 1.6 + 0.8
                });
            }
        };
        var hexToRgb = function (h) {
            h = h.replace('#', '');
            if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
            var n = parseInt(h, 16);
            return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        };
        var draw = function () {
            var rgb = hexToRgb(accent());
            var R = rgb[0], G = rgb[1], B = rgb[2];
            hctx.clearRect(0, 0, W, H);
            for (var i = 0; i < nodes.length; i++) {
                var n = nodes[i];
                n.x += n.vx; n.y += n.vy;
                if (n.x < 0 || n.x > W) n.vx *= -1;
                if (n.y < 0 || n.y > H) n.vy *= -1;
                var dxm = n.x - mouse.x, dym = n.y - mouse.y;
                var dm = Math.sqrt(dxm * dxm + dym * dym);
                if (dm < 130) { n.x += dxm / dm * 0.8; n.y += dym / dm * 0.8; }
                for (var j = i + 1; j < nodes.length; j++) {
                    var m = nodes[j];
                    var dx = n.x - m.x, dy = n.y - m.y;
                    var d = Math.sqrt(dx * dx + dy * dy);
                    if (d < 128) {
                        hctx.strokeStyle = 'rgba(' + R + ',' + G + ',' + B + ',' + (0.16 * (1 - d / 128)) + ')';
                        hctx.lineWidth = 1;
                        hctx.beginPath(); hctx.moveTo(n.x, n.y); hctx.lineTo(m.x, m.y); hctx.stroke();
                    }
                }
            }
            for (var k = 0; k < nodes.length; k++) {
                var p = nodes[k];
                hctx.beginPath();
                hctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                hctx.fillStyle = 'rgba(' + R + ',' + G + ',' + B + ',0.7)';
                hctx.fill();
            }
            heroRaf = requestAnimationFrame(draw);
        };
        var heroRaf = null;
        window.addEventListener('resize', resizeHero);
        window.addEventListener('mousemove', function (e) {
            var rect = heroCanvas.getBoundingClientRect();
            mouse.x = e.clientX - rect.left; mouse.y = e.clientY - rect.top;
        });
        window.addEventListener('mouseout', function () { mouse.x = -9999; mouse.y = -9999; });
        resizeHero();
        // pause when offscreen
        if ('IntersectionObserver' in window) {
            var hio = new IntersectionObserver(function (e) {
                if (e[0].isIntersecting) { if (!heroRaf) draw(); }
                else { if (heroRaf) { cancelAnimationFrame(heroRaf); heroRaf = null; } }
            }, { threshold: 0 });
            hio.observe(heroCanvas);
        } else { draw(); }
    }

    /* ============================================================
       FX toggle: Matrix rain (dark) / sparkle drift (light)
       ============================================================ */
    var fxCanvas = $('#fxCanvas');
    var fxActive = localStorage.getItem('fx') === 'on';
    var fxCtx = fxCanvas ? fxCanvas.getContext('2d') : null;
    var fxRaf = null, columns, drops, sparkles = [];

    function fxResize() {
        if (!fxCanvas) return;
        fxCanvas.width = window.innerWidth;
        fxCanvas.height = window.innerHeight;
    }
    function initMatrix() {
        var fs = 14;
        columns = Math.floor(fxCanvas.width / fs);
        drops = [];
        for (var i = 0; i < columns; i++) drops[i] = Math.random() * -100;
    }
    function initSparkles() {
        sparkles = [];
        for (var i = 0; i < 46; i++) {
            sparkles.push({
                x: Math.random() * fxCanvas.width, y: Math.random() * fxCanvas.height,
                size: Math.random() * 3 + 1, sy: -(Math.random() * 0.4 + 0.1),
                sx: (Math.random() - 0.5) * 0.3, op: Math.random() * 0.6 + 0.2,
                gold: Math.random() > 0.5
            });
        }
    }
    function drawMatrix() {
        var fs = 14;
        fxCtx.fillStyle = 'rgba(6,7,13,0.06)';
        fxCtx.fillRect(0, 0, fxCanvas.width, fxCanvas.height);
        fxCtx.font = fs + 'px monospace';
        var chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノﾊﾋﾌﾍﾎ01<>[]{}#$%&*+=';
        for (var i = 0; i < columns; i++) {
            var ch = chars[Math.floor(Math.random() * chars.length)];
            var x = i * fs, y = drops[i] * fs;
            fxCtx.fillStyle = '#39ff14';
            fxCtx.fillText(ch, x, y);
            fxCtx.fillStyle = 'rgba(46,230,255,0.18)';
            fxCtx.fillText(chars[Math.floor(Math.random() * chars.length)], x, y - fs);
            if (y > fxCanvas.height && Math.random() > 0.975) drops[i] = 0;
            drops[i]++;
        }
    }
    function drawSparkles() {
        fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
        for (var i = 0; i < sparkles.length; i++) {
            var s = sparkles[i];
            s.x += s.sx; s.y += s.sy; s.op += (Math.random() - 0.5) * 0.03;
            if (s.op < 0.12) s.op = 0.2; if (s.op > 0.8) s.op = 0.6;
            if (s.y < -10) { s.y = fxCanvas.height + 10; s.x = Math.random() * fxCanvas.width; }
            if (s.x < -10) s.x = fxCanvas.width + 10;
            if (s.x > fxCanvas.width + 10) s.x = -10;
            fxCtx.save(); fxCtx.translate(s.x, s.y); fxCtx.rotate(Math.PI / 4);
            fxCtx.fillStyle = s.gold ? 'rgba(255,210,63,' + s.op + ')' : 'rgba(46,230,255,' + s.op + ')';
            fxCtx.fillRect(-s.size / 2, -s.size / 2, s.size, s.size);
            fxCtx.restore();
        }
    }
    function fxLoop() {
        var light = root.getAttribute('data-theme') === 'light';
        if (light) drawSparkles(); else drawMatrix();
        fxRaf = requestAnimationFrame(fxLoop);
    }
    function startFx() {
        if (!fxCanvas || prefersReduced) return;
        fxResize();
        if (root.getAttribute('data-theme') === 'light') { initSparkles(); }
        else { initMatrix(); fxCtx.fillStyle = '#06070d'; fxCtx.fillRect(0, 0, fxCanvas.width, fxCanvas.height); }
        if (!fxRaf) fxLoop();
    }
    function stopFx() {
        if (fxRaf) cancelAnimationFrame(fxRaf);
        fxRaf = null;
        if (fxCtx) fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    }
    window.addEventListener('resize', function () { if (fxActive) fxResize(); });
    if (fxActive) { document.body.classList.add('fx-on'); startFx(); }

    var fxToggle = $('#fxToggle');
    if (fxToggle) {
        fxToggle.addEventListener('click', function () {
            fxActive = !fxActive;
            if (fxActive) { localStorage.setItem('fx', 'on'); document.body.classList.add('fx-on'); startFx(); }
            else { localStorage.removeItem('fx'); document.body.classList.remove('fx-on'); stopFx(); }
        });
    }

    /* ============================================================
       Konami code -> arcade coin shower easter egg
       ============================================================ */
    var seq = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65], pos = 0;
    window.addEventListener('keydown', function (e) {
        pos = (e.keyCode === seq[pos]) ? pos + 1 : (e.keyCode === seq[0] ? 1 : 0);
        if (pos === seq.length) { pos = 0; coinShower(); }
    });
    function coinShower() {
        if (prefersReduced) return;
        var n = 28;
        for (var i = 0; i < n; i++) {
            (function (i) {
                var c = document.createElement('div');
                c.textContent = Math.random() > 0.5 ? '🪙' : '⭐';
                c.style.cssText = 'position:fixed;z-index:200;top:-40px;left:' + (Math.random() * 100) + 'vw;font-size:' + (Math.random() * 16 + 18) + 'px;pointer-events:none;will-change:transform;';
                document.body.appendChild(c);
                var dur = 1800 + Math.random() * 1400, rot = (Math.random() - 0.5) * 720;
                c.animate(
                    [{ transform: 'translateY(0) rotate(0)' }, { transform: 'translateY(115vh) rotate(' + rot + 'deg)' }],
                    { duration: dur, easing: 'cubic-bezier(.3,.1,.5,1)', delay: i * 40 }
                ).onfinish = function () { c.remove(); };
            })(i);
        }
        var tag = document.createElement('div');
        tag.textContent = '1UP — ARCADE MODE';
        tag.style.cssText = 'position:fixed;z-index:201;left:50%;top:42%;transform:translateX(-50%);font-family:"Press Start 2P",monospace;color:#ffd23f;text-shadow:0 0 14px rgba(255,210,63,.8);font-size:clamp(12px,3vw,22px);pointer-events:none;';
        document.body.appendChild(tag);
        tag.animate([{ opacity: 0, transform: 'translateX(-50%) scale(.6)' }, { opacity: 1, transform: 'translateX(-50%) scale(1)' }, { opacity: 1 }, { opacity: 0, transform: 'translateX(-50%) scale(1.3)' }],
            { duration: 2200, easing: 'ease-out' }).onfinish = function () { tag.remove(); };
        if (!fxActive && fxToggle) fxToggle.click();
    }
})();
