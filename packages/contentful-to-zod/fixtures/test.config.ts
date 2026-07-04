import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { defineConfig } from "../src/config/define-config";

const fixtureDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  fromSnapshot: true,
  snapshot: join(fixtureDir, "content-types.json"),
  snapshotLocales: join(fixtureDir, "locales.json"),
  out: join(fixtureDir, "contentful.schemas.ts"),
  contentTypeIds: ["blogPost", "author"],
  locale: {
    mode: "both",
  },
  objects: {
    "blogPost.metadata": z.object({
      seoTitle: z.string(),
      noIndex: z.boolean().optional(),
    }),
  },
});
