import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { defineConfig } from "@xndrjs/contentful-to-zod";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");

export default defineConfig({
  fromSnapshot: true,
  snapshot: join(appDir, "schema-fixtures/content-types.json"),
  snapshotLocales: join(appDir, "schema-fixtures/locales.json"),
  out: join(appDir, "generated/both-locale-star.schemas.ts"),
  locale: {
    mode: "both",
    localeStar: true,
  },
  objects: {
    "article.seo": z.object({
      seoTitle: z.string(),
      noIndex: z.boolean().optional(),
    }),
  },
});
