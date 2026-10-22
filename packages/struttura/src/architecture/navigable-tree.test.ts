import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { apply } from "../apply/apply";
import { toKebabCase } from "../casing/casing";
import { deriveDesiredInventory } from "../inventory/derive-desired-inventory";
import { createPopulation } from "../population/create-population";
import { defineArchitecture } from "./define-architecture";

describe("navigable tree (ticket 01 minimal)", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("derives inventory with '.' root key and child keys, seals navigable instance", () => {
    const A = defineArchitecture("MinimalTree");
    const CorePackage = A.construct("CorePackage", {}, ({ name }) =>
      A.in(
        A.rootDirectory,
        A.dir(`packages/core-${toKebabCase(name)}`, {
          packageJson: A.file("package.json", '{ "name": "core" }\n'),
          readme: A.file("README.md", "# core\n"),
        })
      )
    );

    const population = createPopulation(A);
    const core = population.add(CorePackage, { name: "pagebuilder" });

    const result = deriveDesiredInventory(population);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(
      result.inventory.artifacts.map((a) => ({
        key: a.artifactKey,
        kind: a.kind,
        path: a.path,
      }))
    ).toEqual([
      {
        key: ".",
        kind: "directory",
        path: "packages/core-pagebuilder",
      },
      {
        key: "readme",
        kind: "file",
        path: "packages/core-pagebuilder/README.md",
      },
      {
        key: "packageJson",
        kind: "file",
        path: "packages/core-pagebuilder/package.json",
      },
    ]);

    const packageJson = result.inventory.artifacts.find((a) => a.artifactKey === "packageJson");
    expect(packageJson).toMatchObject({
      instanceId: "pagebuilder",
      constructName: "CorePackage",
      mode: "scaffold",
      filename: "package.json",
      directory: { kind: "artifact", instanceId: "pagebuilder", artifactKey: "." },
    });

    // Navigable instance: reserved + children; no enumerable .artifacts / destination string
    const navigable = core as unknown as {
      name: string;
      id: string;
      construct: typeof CorePackage;
      path: string;
      packageJson: { path: string };
      readme: { path: string };
    };
    expect(navigable.name).toBe("pagebuilder");
    expect(navigable.id).toBe("pagebuilder");
    expect(navigable.construct).toBe(CorePackage);
    expect(navigable.path).toBe("packages/core-pagebuilder");
    expect(navigable.packageJson.path).toBe("packages/core-pagebuilder/package.json");
    expect(navigable.readme.path).toBe("packages/core-pagebuilder/README.md");

    const enumerableKeys = Object.keys(core);
    expect(enumerableKeys).toContain("packageJson");
    expect(enumerableKeys).toContain("readme");
    expect(enumerableKeys).toContain("path");
    expect(enumerableKeys).toContain("name");
    expect(enumerableKeys).not.toContain("artifacts");
    expect(enumerableKeys).not.toContain("destination");
    expect("artifacts" in core).toBe(true); // non-enumerable engine slot

    expect(A.destination(core)).toBe(A.rootDirectory);
    expect(A.destination(core).kind).toBe("root");
  });

  it("reports reserved-key-collision when a child uses a reserved top-level name", () => {
    const A = defineArchitecture("ReservedCollision");
    const Bad = A.construct("Bad", {}, () =>
      A.in(
        A.rootDirectory,
        A.dir("pkg", {
          name: A.file("name.txt", "x\n"),
        })
      )
    );

    const population = createPopulation(A);
    population.add(Bad, { name: "bad" });

    const result = deriveDesiredInventory(population);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "reserved-key-collision",
        artifactKey: "name",
        constructName: "Bad",
        instanceId: "bad",
      }),
    ]);
  });

  it("applies scaffold files from a tree construct with the existing engine", () => {
    const A = defineArchitecture("MinimalApply");
    const CorePackage = A.construct("CorePackage", {}, ({ name }) =>
      A.in(
        A.rootDirectory,
        A.dir(`packages/core-${toKebabCase(name)}`, {
          packageJson: A.file("package.json", '{ "name": "pagebuilder" }\n'),
          readme: A.file("README.md", "# pagebuilder\n"),
        })
      )
    );

    const population = createPopulation(A);
    population.add(CorePackage, { name: "pagebuilder" });

    tempDir = mkdtempSync(join(tmpdir(), "struttura-tree-"));
    const architectureDir = join(tempDir, "architecture");
    const materializationRoot = join(tempDir, "project");

    const first = apply(population, { architectureDir, materializationRoot });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    expect(existsSync(join(materializationRoot, "packages/core-pagebuilder"))).toBe(true);
    expect(
      readFileSync(join(materializationRoot, "packages/core-pagebuilder/package.json"), "utf8")
    ).toBe('{ "name": "pagebuilder" }\n');
    expect(
      readFileSync(join(materializationRoot, "packages/core-pagebuilder/README.md"), "utf8")
    ).toBe("# pagebuilder\n");

    // Scaffold: second apply preserves authored edits
    const pkgPath = join(materializationRoot, "packages/core-pagebuilder/package.json");
    writeFileSync(pkgPath, '{ "name": "authored" }\n');

    const second = apply(population, { architectureDir, materializationRoot });
    expect(second.ok).toBe(true);
    expect(readFileSync(pkgPath, "utf8")).toBe('{ "name": "authored" }\n');
    expect(readdirSync(join(materializationRoot, "packages/core-pagebuilder")).sort()).toEqual([
      "README.md",
      "package.json",
    ]);
  });
});
