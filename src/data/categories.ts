// ─────────────────────────────────────────────────────────────────────────
//  Blog categories — each gets its own themed page (accent, motif, voice).
//  Slugs are stable: they're used in URLs and post frontmatter.
// ─────────────────────────────────────────────────────────────────────────

export interface Category {
  slug: string;
  name: string;
  icon: string;
  tagline: string;
  blurb: string;
  /** empty-state line shown when the category has no posts yet */
  empty: string;
  /** CSS color for the category accent */
  accent: string;
  /** visual motif rendered in the category hero */
  motif: "terminal" | "neural" | "belt" | "ink";
}

export const categories: Category[] = [
  {
    slug: "security",
    name: "Security",
    icon: "🔒",
    tagline: "Offense informs defense",
    blurb:
      "Security learnings, CTF writeups, and research — the offensive perspective that makes you a better defender.",
    empty: "No writeups published yet — the lab is busy. Stay tuned.",
    accent: "#36f9b3",
    motif: "terminal",
  },
  {
    slug: "cognitive-science",
    name: "Cognitive Science",
    icon: "🧠",
    tagline: "Minds & machines",
    blurb:
      "Psychology, AI, neuroscience, and anthropology — where the study of natural intelligence meets the engineering of the artificial kind.",
    empty: "Under construction. New writing on the way.",
    accent: "#a855f7",
    motif: "neural",
  },
  {
    slug: "jiu-jitsu",
    name: "Jiu-Jitsu",
    icon: "🥋",
    tagline: "The gentle art",
    blurb:
      "A newbie's thoughts and advice on Brazilian Jiu-Jitsu — the gentle art of folding clothes while people are still wearing them.",
    empty: "More posts rolling out as I keep training. Stay tuned.",
    accent: "#ff5a5c",
    motif: "belt",
  },
  {
    slug: "ramblings",
    name: "Ramblings",
    icon: "💭",
    tagline: "Eye of the beholder",
    blurb:
      "Beauty is in the eye of the beholder. Miscellaneous writings on whatever catches my interest.",
    empty: "Nothing here yet — check back soon.",
    accent: "#ffd25a",
    motif: "ink",
  },
];

export const categoryBySlug = (slug: string) =>
  categories.find((c) => c.slug === slug);
