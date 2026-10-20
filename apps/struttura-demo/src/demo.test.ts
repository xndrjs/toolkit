import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { apply } from "@xndrjs/struttura";

import { population } from "./architecture/population";

const demoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const architectureDir = join(demoRoot, "src/architecture");
const materializationRoot = join(demoRoot, "src/project");

const expectedPaths = [
  "package.json",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "specs/pagebuilder/SPEC.md",
  "specs/pagebuilder/DESIGN.md",
  "packages/core-pagebuilder/package.json",
  "packages/core-pagebuilder/models/page.shape.ts",
  "packages/core-pagebuilder/models/page-slug.primitive.ts",
  "packages/core-pagebuilder/models/published-page.proof.ts",
  "packages/core-pagebuilder/models/index.ts",
  "packages/core-pagebuilder/operations/page.capabilities.ts",
  "packages/core-pagebuilder/operations/page-pricing.service.ts",
  "packages/core-pagebuilder/operations/index.ts",
  "packages/core-pagebuilder/errors/page-not-found.error.ts",
  "packages/core-pagebuilder/errors/index.ts",
  "packages/core-pagebuilder/ports/page-repository.port.ts",
  "packages/core-pagebuilder/ports/index.ts",
  "packages/core-pagebuilder/use-cases/resolve-page.use-case.ts",
  "packages/core-pagebuilder/use-cases/index.ts",
  "packages/infrastructure-contentful/loaders/page.loader.ts",
  "packages/infrastructure-contentful/mappers/page.mapper.ts",
  "packages/infrastructure-contentful/repositories/page-repository.repository.ts",
  "packages/infrastructure-contentful/index.ts",
  "packages/ui-react/index.ts",
  "apps/web-next/package.json",
  "apps/web-next/composition/web-server.composition.ts",
] as const;

describe("struttura-demo guide materialization", () => {
  it("has the expected xndrjs-monorepo replica tree under src/project", () => {
    for (const relative of expectedPaths) {
      expect(existsSync(join(materializationRoot, relative)), relative).toBe(true);
    }
  });

  it("re-apply is a no-op when disk and population already match", () => {
    const result = apply(population, { architectureDir, materializationRoot });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.mutated).toBe(false);
    expect(result.plan).toEqual([]);
  });
});
