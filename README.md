# emanuel.antablin.com

Personal site for **Emanuel Antablin — AI Engineer** (Lead Software Engineer at
Walmart Global Tech). A single flagship landing page that goes deep on agentic
AI / RAG / LLM expertise — with a retro-arcade soul.

Built with **[Astro](https://astro.build)**, deployed to GitHub Pages via
**GitHub Actions**. Static HTML output → fast and fully crawlable.

## What's inside

- **Boot sequence** — an "INSERT COIN" style cold-boot intro → `PRESS START`.
- **WebGL hero** (Three.js) — a 3D *agent network*: glowing agent-nodes wired
  into a graph with signal pulses routing along the edges (observe → reason →
  act). Degrades to a static frame; perf guards on low-power devices; respects
  `prefers-reduced-motion`.
- **Deep AI expertise** — four pillars (Agentic AI · RAG · LLMs as Infrastructure
  · Production & Evaluation) and four case studies with real, résumé-grounded
  metrics (MTTR ~4h→<30min, $1M+/yr, 10× data, +20% retention).
- **Arcade easter eggs:**
  - 🟡 **Jiggy collectathon** — five hidden golden jiggies scattered across the
    sections (Banjo-Kazooie style ascending note chimes); the HUD tracks them.
  - 🎮 **MONOLITH SMASH** — a hidden, playable Rampage-style mini-game (level the
    legacy monolith, dodge the bug-drones). Open it from the HUD ▶ button.
  - 📺 **CRT mode** — toggle scanlines from the HUD (or the Konami code).
  - **Score HUD** — jiggies + score, top-right (bottom on mobile).
- **SEO** — JSON-LD (`Person` + `WebSite`), Open Graph/Twitter, sitemap, robots.
- All audio is synthesized with the WebAudio API (no asset files); muted-toggle
  in the HUD; only starts after the `PRESS START` user gesture.

## Structure

```
public/
  CNAME .nojekyll robots.txt favicon.svg og-image.jpg manifest.webmanifest
src/
  data/profile.ts        ← single source of truth (all copy, stats, case studies)
  layouts/Base.astro     ← shell: boot, overlays, HUD, nav, footer, mini-game modal
  components/Seo.astro    ← meta + JSON-LD
  scripts/
    boot.js              orchestrator
    hero3d.js            Three.js agent-network hero
    ui.js                nav, reveals, typed line, count-up stats
    arcade.js            boot seq, HUD, jiggy collectathon, CRT, sound
    minigame.js          MONOLITH SMASH (canvas game)
  styles/global.css
  pages/
    index.astro          the flagship page
    404.astro            "GAME OVER" page
```

**Editing content:** everything lives in [`src/data/profile.ts`](src/data/profile.ts).

## Develop

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # static output → dist/
```

## Deploy

Pushing to `main` triggers [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml),
which builds and publishes `dist/` to GitHub Pages.

**One-time repo setting (after the Astro migration):**
**Settings → Pages → Build and deployment → Source: GitHub Actions.**
This site previously deployed from a branch; that's now replaced by the Actions
build. `public/CNAME` keeps `emanuel.antablin.com` attached.
