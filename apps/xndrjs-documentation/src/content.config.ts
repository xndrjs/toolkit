import { defineCollection, z } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        /** Publication date for blog posts under `blog/`; optional elsewhere. Used for ordering on the blog index. */
        date: z.coerce.date().optional(),
        /** Optional labels for blog index cards and filtering. */
        tags: z.array(z.string()).optional(),
      }),
    }),
  }),
};
