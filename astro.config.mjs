// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// Served from a custom domain at the root (emanuel.antablin.com).
export default defineConfig({
  site: "https://emanuel.antablin.com",
  trailingSlash: "ignore",
  integrations: [sitemap()],
  build: { inlineStylesheets: "auto" },
});
