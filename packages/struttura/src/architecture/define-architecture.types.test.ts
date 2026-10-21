import { describe, expectTypeOf, it } from "vitest";

import { defineArchitecture, dir, file, type DirRef, type FileRef } from "./define-architecture";

describe("defineConstruct typed dependency artifacts", () => {
  it("types dep .artifacts from the dependency construct return map", () => {
    const A = defineArchitecture("TypedDeps");
    const corePackage = A.defineConstruct("CorePackage", ({ name }) => {
      const packageDirectory = dir(`packages/core-${name}`);
      const models = dir(`${packageDirectory.path}/models`);
      return {
        packageDirectory,
        models,
        modelsIndex: file({
          filename: "index.ts",
          directory: models,
          mode: "sync",
          content: "",
        }),
      };
    });

    A.defineConstruct("Model", { core: corePackage })(({ name, core }) => {
      expectTypeOf(core.artifacts.packageDirectory).toEqualTypeOf<DirRef>();
      expectTypeOf(core.artifacts.models).toEqualTypeOf<DirRef>();
      expectTypeOf(core.artifacts.modelsIndex).toEqualTypeOf<FileRef>();
      expectTypeOf(name).toEqualTypeOf<string>();

      // FileRef must not be accepted as file({ directory })
      expectTypeOf(core.artifacts.modelsIndex).not.toExtend<
        Parameters<typeof file>[0]["directory"]
      >();
      expectTypeOf(core.artifacts.models).toExtend<Parameters<typeof file>[0]["directory"]>();

      return {
        source: file({
          filename: `${name}.model.ts`,
          directory: core.artifacts.models,
          mode: "scaffold",
        }),
      };
    });
  });

  it("types no-deps context as name/id only", () => {
    const A = defineArchitecture("NoDeps");
    A.defineConstruct("Pkg", (ctx) => {
      expectTypeOf(ctx.name).toEqualTypeOf<string>();
      expectTypeOf(ctx.id).toEqualTypeOf<string>();
      return {
        root: dir("pkg"),
      };
    });
  });
});
