import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// Blog posts live in src/content/blog/*.md.
// `category` must match a slug in src/data/categories.ts.
const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    category: z.enum(["security", "cognitive-science", "jiu-jitsu", "ramblings"]),
    readMinutes: z.number().default(2),
    /** short bullet summary rendered as the tl;dr box */
    tldr: z.array(z.string()).default([]),
  }),
});

export const collections = { blog };
