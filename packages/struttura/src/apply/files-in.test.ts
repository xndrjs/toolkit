import { describe, expect, it } from "vitest";

import { defineStructure } from "../structure/define-structure";
import { toKebabCase } from "../casing/casing";
import { deriveDesiredInventory } from "../inventory/derive-desired-inventory";
import { createPopulation } from "../population/create-population";
import { artifactIdentity } from "./manifest";
import type { FileRenderContext } from "./render-contents";
import { renderFileContents } from "./render-contents";

function pathsFromBarrel(content: string): string[] {
  return content
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.replace(/^export \* from "\.\/(.+)";$/, "$1"));
}

describe("filesIn on Sync render (ADR 0014)", () => {
  it("lists sibling managed files by DirRef identity, excluding self by default", () => {
    const A = defineStructure("Siblings");
    const ModelsModule = A.construct("ModelsModule", {}, () =>
      A.in(
        A.rootDirectory,
        A.dir("packages/core-x/models", {
          index: A.file(
            "index.ts",
            (ctx: FileRenderContext) => {
              const files = ctx.filesIn(ctx.directory);
              return `${files
                .map((f) => `export * from "./${(f.filename ?? "").replace(/\.tsx?$/, "")}";`)
                .join("\n")}\n`;
            },
            { mode: "sync" }
          ),
        })
      )
    );
    const Shape = A.construct("Shape", { models: ModelsModule }, ({ name, models }) =>
      A.in(models, A.file(`${toKebabCase(name)}.model.ts`, `export type ${name} = {};\n`))
    );

    const population = createPopulation(A);
    const models = population.add(ModelsModule, { name: "models" });
    population.add(Shape, { name: "page", models });
    population.add(Shape, { name: "pageSlug", models });

    const derived = deriveDesiredInventory(population);
    expect(derived.ok).toBe(true);
    if (!derived.ok) {
      return;
    }

    const contents = renderFileContents(population, derived.inventory);
    const barrel = contents.get(artifactIdentity({ instanceId: "models", artifactKey: "index" }));
    expect(pathsFromBarrel(barrel ?? "")).toEqual(["page-slug.model", "page.model"]);
  });

  it("includeSelf includes the file being rendered", () => {
    const A = defineStructure("IncludeSelf");
    const ModelsModule = A.construct("ModelsModule", {}, () =>
      A.in(
        A.rootDirectory,
        A.dir("packages/core-x/models", {
          index: A.file(
            "index.ts",
            (ctx: FileRenderContext) =>
              ctx
                .filesIn(ctx.directory, { includeSelf: true })
                .map((f) => f.filename ?? "")
                .join(","),
            { mode: "sync" }
          ),
        })
      )
    );
    const Shape = A.construct("Shape", { models: ModelsModule }, ({ name, models }) =>
      A.in(models, A.file(`${toKebabCase(name)}.model.ts`, `export type ${name} = {};\n`))
    );

    const population = createPopulation(A);
    const models = population.add(ModelsModule, { name: "models" });
    population.add(Shape, { name: "page", models });

    const derived = deriveDesiredInventory(population);
    expect(derived.ok).toBe(true);
    if (!derived.ok) {
      return;
    }

    const contents = renderFileContents(population, derived.inventory);
    expect(contents.get(artifactIdentity({ instanceId: "models", artifactKey: "index" }))).toBe(
      "index.ts,page.model.ts"
    );
  });

  it("recursive includes nested managed files by path prefix; default is identity-only", () => {
    const A = defineStructure("Recursive");
    let identityListed: string[] = [];
    let recursiveListed: string[] = [];

    const ModelsModule = A.construct("ModelsModule", {}, () =>
      A.in(
        A.rootDirectory,
        A.dir("packages/core-x/models", {
          index: A.file(
            "index.ts",
            (ctx: FileRenderContext) => {
              identityListed = ctx.filesIn(ctx.directory).map((f) => f.path);
              recursiveListed = ctx.filesIn(ctx.directory, { recursive: true }).map((f) => f.path);
              return "";
            },
            { mode: "sync" }
          ),
        })
      )
    );
    const FlatShape = A.construct("FlatShape", { models: ModelsModule }, ({ name, models }) =>
      A.in(models, A.file(`${toKebabCase(name)}.model.ts`, `export type ${name} = {};\n`))
    );
    const NestedShape = A.construct("NestedShape", { models: ModelsModule }, ({ name, models }) =>
      A.in(
        models,
        A.dir("identity", {
          source: A.file(`${toKebabCase(name)}.model.ts`, `export type ${name} = {};\n`),
        })
      )
    );

    const population = createPopulation(A);
    const models = population.add(ModelsModule, { name: "models" });
    population.add(FlatShape, { name: "page", models });
    population.add(NestedShape, { name: "pageSlug", models });

    const derived = deriveDesiredInventory(population);
    expect(derived.ok).toBe(true);
    if (!derived.ok) {
      return;
    }

    renderFileContents(population, derived.inventory);

    expect(identityListed).toEqual(["packages/core-x/models/page.model.ts"]);
    expect(recursiveListed).toEqual([
      "packages/core-x/models/identity/page-slug.model.ts",
      "packages/core-x/models/page.model.ts",
    ]);
  });

  it("exclude drops files by relative path string or RegExp", () => {
    const A = defineStructure("Exclude");
    let byString: string[] = [];
    let byRegex: string[] = [];

    const ModelsModule = A.construct("ModelsModule", {}, () =>
      A.in(
        A.rootDirectory,
        A.dir("packages/core-x/models", {
          index: A.file(
            "index.ts",
            (ctx: FileRenderContext) => {
              byString = ctx
                .filesIn(ctx.directory, { exclude: "page.model.ts" })
                .map((f) => f.filename ?? "");
              byRegex = ctx
                .filesIn(ctx.directory, { exclude: /slug/ })
                .map((f) => f.filename ?? "");
              return "";
            },
            { mode: "sync" }
          ),
        })
      )
    );
    const Shape = A.construct("Shape", { models: ModelsModule }, ({ name, models }) =>
      A.in(models, A.file(`${toKebabCase(name)}.model.ts`, `export type ${name} = {};\n`))
    );

    const population = createPopulation(A);
    const models = population.add(ModelsModule, { name: "models" });
    population.add(Shape, { name: "page", models });
    population.add(Shape, { name: "pageSlug", models });

    const derived = deriveDesiredInventory(population);
    expect(derived.ok).toBe(true);
    if (!derived.ok) {
      return;
    }

    renderFileContents(population, derived.inventory);

    expect(byString).toEqual(["page-slug.model.ts"]);
    expect(byRegex).toEqual(["page.model.ts"]);
  });

  it("filesIn on root returns files targeting the materialization root", () => {
    const A = defineStructure("RootFiles");
    let listed: string[] = [];
    let directoryKind: string | undefined;

    const Pkg = A.construct("Pkg", {}, () =>
      A.in(A.rootDirectory, {
        packageJson: A.file("package.json", "{}\n"),
        readme: A.file(
          "README.md",
          (ctx: FileRenderContext) => {
            directoryKind = ctx.directory.kind;
            listed = ctx.filesIn(ctx.directory).map((f) => f.path);
            return "# hi\n";
          },
          { mode: "sync" }
        ),
      })
    );

    const population = createPopulation(A);
    population.add(Pkg, { name: "root-files" });

    const derived = deriveDesiredInventory(population);
    expect(derived.ok).toBe(true);
    if (!derived.ok) {
      return;
    }

    renderFileContents(population, derived.inventory);

    expect(directoryKind).toBe("root");
    expect(listed).toEqual(["package.json"]);
  });

  it("matches directory identity, not path alone", () => {
    const A = defineStructure("PathVsIdentity");
    let listed: string[] = [];

    const Owner = A.construct("Owner", {}, () =>
      A.in(
        A.rootDirectory,
        A.dir("shared", {
          keep: A.file(".gitkeep", ""),
          index: A.file(
            "index.ts",
            (ctx: FileRenderContext) => {
              listed = ctx.filesIn(ctx.directory).map((f) => f.path);
              return "";
            },
            { mode: "sync" }
          ),
        })
      )
    );
    const Other = A.construct("Other", {}, () =>
      A.in(
        A.rootDirectory,
        A.dir("shared-other", {
          nested: A.file("x.ts", "export {};\n"),
        })
      )
    );

    const population = createPopulation(A);
    population.add(Owner, { name: "owner" });
    population.add(Other, { name: "other" });

    const derived = deriveDesiredInventory(population);
    expect(derived.ok).toBe(true);
    if (!derived.ok) {
      return;
    }

    renderFileContents(population, derived.inventory);
    expect(listed).toEqual(["shared/.gitkeep"]);
  });

  it("exposes ctx.directory as the owning DirRef for the file being rendered", () => {
    const A = defineStructure("CtxDirectory");
    let directory: FileRenderContext["directory"] | undefined;

    const ModelsModule = A.construct("ModelsModule", {}, () =>
      A.in(
        A.rootDirectory,
        A.dir("packages/core-x/models", {
          index: A.file(
            "index.ts",
            (ctx: FileRenderContext) => {
              directory = ctx.directory;
              return "";
            },
            { mode: "sync" }
          ),
        })
      )
    );

    const population = createPopulation(A);
    population.add(ModelsModule, { name: "models" });

    const derived = deriveDesiredInventory(population);
    expect(derived.ok).toBe(true);
    if (!derived.ok) {
      return;
    }

    renderFileContents(population, derived.inventory);

    expect(directory).toMatchObject({
      kind: "directory",
      path: "packages/core-x/models",
      instanceId: "models",
      artifactKey: ".",
    });
  });
});
