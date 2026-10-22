import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { defineArchitecture } from "../architecture/define-architecture";
import { apply } from "../apply/apply";
import { readManifest } from "../apply/manifest";
import { createPopulation } from "../population/create-population";
import { migrateId, rewriteManifestIds } from "./migrate-id";

describe("migrate-id", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("rewrites instance id and every structured reference in the manifest", () => {
    tempDir = mkdtempSync(join(tmpdir(), "struttura-migrate-id-"));
    const architectureDir = join(tempDir, "architecture");
    const materializationRoot = join(tempDir, "project");

    const A = defineArchitecture("CleanArchitecture");
    const core = A.construct("CorePackage", {}, ({ name }) =>
      A.in(
        A.rootDirectory,
        A.dir(`packages/${name}`, {
          models: A.dir({}),
        })
      )
    );
    const model = A.construct("Model", { core }, ({ name, core: c }) =>
      A.in(c.models, A.file(`${name}.ts`, `export type ${name} = {};\n`))
    );

    const population = createPopulation(A);
    const pagebuilder = population.add(core, { name: "pagebuilder" });
    // Effective id "page" — migrate to "editorialPage" so population can drop explicit id.
    population.add(model, { id: "page", name: "editorialPage", core: pagebuilder });

    const applied = apply(population, { architectureDir, materializationRoot });
    expect(applied.ok).toBe(true);

    const result = migrateId({ architectureDir, from: "page", to: "editorialPage" });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.mutated).toBe(true);

    const manifest = readManifest(architectureDir);
    expect(manifest?.instances.map((i) => i.id).sort()).toEqual(["editorialPage", "pagebuilder"]);
    expect(manifest?.instances.find((i) => i.id === "editorialPage")?.dependencies).toEqual({
      core: "pagebuilder",
    });
    expect(
      manifest?.artifacts.find((a) => a.artifactKey === "." && a.constructName === "Model")
    ).toMatchObject({
      instanceId: "editorialPage",
      directory: { kind: "artifact", instanceId: "pagebuilder", artifactKey: "models" },
    });
  });

  it("rewrites dependency and directory refs when the migrated id is a producer", () => {
    const rewritten = rewriteManifestIds(
      {
        version: 1,
        architectureName: "CleanArchitecture",
        materializationRoot: "../project",
        instances: [
          {
            id: "old-core",
            name: "pagebuilder",
            constructName: "CorePackage",
            dependencies: {},
          },
          {
            id: "page",
            name: "page",
            constructName: "Model",
            dependencies: { core: "old-core" },
          },
        ],
        artifacts: [
          {
            instanceId: "old-core",
            constructName: "CorePackage",
            artifactKey: "models",
            kind: "directory",
            path: "packages/core/models",
            directory: { kind: "inline", path: "packages/core/models" },
          },
          {
            instanceId: "page",
            constructName: "Model",
            artifactKey: ".",
            kind: "file",
            path: "packages/core/models/page.ts",
            mode: "scaffold",
            filename: "page.ts",
            directory: { kind: "artifact", instanceId: "old-core", artifactKey: "models" },
          },
        ],
      },
      "old-core",
      "pagebuilder"
    );

    expect(rewritten.instances.find((i) => i.id === "pagebuilder")?.name).toBe("pagebuilder");
    expect(rewritten.instances.find((i) => i.id === "page")?.dependencies).toEqual({
      core: "pagebuilder",
    });
    expect(rewritten.artifacts.map((a) => a.instanceId).sort()).toEqual(["page", "pagebuilder"]);
    expect(rewritten.artifacts.find((a) => a.artifactKey === ".")?.directory).toEqual({
      kind: "artifact",
      instanceId: "pagebuilder",
      artifactKey: "models",
    });
  });

  it("fails closed on missing manifest, unknown id, collision, and same id", () => {
    tempDir = mkdtempSync(join(tmpdir(), "struttura-migrate-id-fail-"));
    const architectureDir = join(tempDir, "architecture");

    expect(migrateId({ architectureDir, from: "a", to: "b" })).toMatchObject({
      ok: false,
      diagnostics: [{ code: "missing-manifest" }],
    });

    expect(migrateId({ architectureDir, from: "a", to: "a" })).toMatchObject({
      ok: false,
      diagnostics: [{ code: "same-id" }],
    });

    const A = defineArchitecture("CleanArchitecture");
    const pkg = A.construct("Pkg", {}, ({ name }) => A.in(A.rootDirectory, A.dir(name, {})));
    const population = createPopulation(A);
    population.add(pkg, { name: "alpha" });
    population.add(pkg, { name: "beta" });
    const applied = apply(population, {
      architectureDir,
      materializationRoot: join(tempDir, "project"),
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      throw new Error(applied.diagnostics.map((d) => d.message).join("; "));
    }

    expect(migrateId({ architectureDir, from: "missing", to: "gamma" })).toMatchObject({
      ok: false,
      diagnostics: [{ code: "unknown-old-id" }],
    });
    expect(migrateId({ architectureDir, from: "alpha", to: "beta" })).toMatchObject({
      ok: false,
      diagnostics: [{ code: "id-collision" }],
    });
  });
});
