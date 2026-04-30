import { defineCollection, z } from "astro:content";

const docsCollection = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    order: z.number().optional(),
    seeAlso: z.string().optional(), // Markdown content
  }),
});

export const collections = {
  docs: docsCollection,
};
