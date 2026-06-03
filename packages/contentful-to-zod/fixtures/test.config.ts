import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "../src/config/define-config";

const fixtureDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  fromSnapshot: true,
  snapshot: join(fixtureDir, "content-types.json"),
  snapshotLocales: join(fixtureDir, "locales.json"),
  out: join(fixtureDir, "contentful.schemas.ts"),
  contentTypeIds: ["blogPost"],
  locale: {
    mode: "both",
  },
});
