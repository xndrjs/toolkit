import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "@xndrjs/contentful-to-zod";

const cmsDir = dirname(fileURLToPath(import.meta.url));
const appRoot = join(cmsDir, "../../..");

export default defineConfig({
  fromSnapshot: true,
  snapshot: join(appRoot, "fixtures/content-types.json"),
  snapshotLocales: join(appRoot, "fixtures/locales.json"),
  out: join(cmsDir, "generated/contentful.schemas.ts"),
  locale: {
    mode: "both",
  },
});
