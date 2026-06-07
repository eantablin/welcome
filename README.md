# emanuel.antablin.com

Personal site for **Emanuel Antablin — AI Engineer**. Static, no build step, deployed via
GitHub Pages (custom domain in `CNAME`).

## Design

A premium dark "AI lab" aesthetic with a retro-arcade soul. Dark is the default theme; light is
the alternate (toggled by the Mario Super Star ⭐ button). The flower button toggles background FX
(Matrix rain in dark, sparkle drift in light). There's a Konami-code easter egg too. ↑↑↓↓←→←→BA

## Structure

```
index.html          Landing page (hero, stats, about, skills, case studies, timeline, contact)
styles.css          Design system (tokens, components, responsive, print, reduced-motion)
app.js              Shared behavior (nav, theme/FX toggles, hero neural canvas, reveals, counters)
consult.html        Consulting offerings
404.html            Game-over page (uses root-absolute asset paths)
mentoringTips.html  Article
uxtips.html         Article
favicon.svg         Favicon
og-image.jpg        Social share card (1200×630)
robots.txt · sitemap.xml · manifest.webmanifest · .nojekyll   SEO / PWA infra
pages/
  resume.html       Formatted, printable résumé
  portfolio.html    Detailed case studies
  services.html     Service offerings
  contact.html      Contact channels
  blog.html         Blog index
  blog/{Security,CognitiveScience,BJJ,Ramblings}/   Category pages
```

## SEO

Every page has a unique title/description, canonical URL, Open Graph + Twitter tags, and the home
page carries JSON-LD (`Person`, `WebSite`, `ProfilePage`). Positioned around **AI Engineer**.

## Local preview

```
python3 -m http.server 4321   # then open http://localhost:4321
```
