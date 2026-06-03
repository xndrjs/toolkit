import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadConfigFile } from "./load-config";

describe("loadConfigFile", () => {
  it("loads TypeScript config files through jiti", async () => {
    const dir = await mkdtemp(join(tmpdir(), "contentful-to-zod-"));
    const configPath = join(dir, "contentful-to-zod.config.ts");

    await writeFile(
      configPath,
      `
const mode: "cma" = "cma";

export default {
  cma: {
    spaceId: process.env.CONTENTFUL_BLOG_SPACE_ID,
    managementToken: process.env.CONTENTFUL_BLOG_MANAGEMENT_TOKEN,
    environment: process.env.CONTENTFUL_BLOG_ENVIRONMENT ?? "master",
  },
  out: "./src/generated/contentful.schemas.ts",
  snapshot: "./content-types.json",
  snapshotLocales: "./locales.json",
  contentTypeIds: ["blogPost"],
  locale: { mode },
  fields: { includeDisabled: true },
};
`,
      "utf8"
    );

    await expect(loadConfigFile(configPath)).resolves.toEqual({
      cma: {
        spaceId: undefined,
        managementToken: undefined,
        environment: "master",
      },
      out: "./src/generated/contentful.schemas.ts",
      snapshot: "./content-types.json",
      snapshotLocales: "./locales.json",
      contentTypeIds: ["blogPost"],
      locale: { mode: "cma" },
      fields: { includeDisabled: true },
    });
  });
});
