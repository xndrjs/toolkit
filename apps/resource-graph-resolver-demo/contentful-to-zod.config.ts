import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "@xndrjs/contentful-to-zod";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  fromSnapshot: true,
  snapshot: join(root, "fixtures/content-types.json"),
  snapshotLocales: join(root, "fixtures/locales.json"),
  out: join(root, "src/generated/contentful.schemas.ts"),
  contentTypeIds: ["page", "tabs", "tab", "hero", "menu", "footer", "product"],
  locale: {
    mode: "both",
  },
});
