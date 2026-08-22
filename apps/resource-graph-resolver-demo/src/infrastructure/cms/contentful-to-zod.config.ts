import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "@xndrjs/contentful-to-zod";

const cmsDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  fromSnapshot: true,
  snapshot: join(cmsDir, "schema-fixtures/content-types.json"),
  snapshotLocales: join(cmsDir, "schema-fixtures/locales.json"),
  out: join(cmsDir, "generated/contentful.schemas.ts"),
  locale: {
    mode: "both",
  },
});
