import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { categoryBySlug } from "../data/categories";

export async function GET(context) {
  const posts = (await getCollection("blog")).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf()
  );
  return rss({
    title: "Emanuel Antablin — Blog",
    description:
      "Notes from the rabbit hole: security, cognitive science, AI, jiu-jitsu, and whatever else catches my interest.",
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      link: `/blog/${post.data.category}/${post.id}/`,
      categories: [categoryBySlug(post.data.category)?.name ?? post.data.category],
    })),
    customData: "<language>en</language>",
  });
}
