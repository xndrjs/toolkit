// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import mdx from "@astrojs/mdx";
import mermaid from "astro-mermaid";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSlug from "rehype-slug";

// https://astro.build/config
export default defineConfig({
  integrations: [react(), mdx(), mermaid()],
  markdown: {
    shikiConfig: {
      theme: "dracula",
      wrap: true,
    },
    rehypePlugins: [
      rehypeSlug,
      [
        rehypeAutolinkHeadings,
        {
          behavior: "append",
          properties: {
            class: "anchor-link",
            ariaLabel: "Link to heading",
          },
        },
      ],
    ],
  },
  output: "static",
  site: "https://xndrjs.dev",
});
