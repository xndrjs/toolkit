import { describe, expectTypeOf, it } from "vitest";

import {
  defineArchitecture,
  dir,
  file,
  type DirRef,
  type FileRef,
  type PlacementDestination,
} from "./define-architecture";

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

describe("construct navigable dependency children", () => {
  it("types adapter.repositories as DirRef from declared tree children", () => {
    const A = defineArchitecture("TreeNavDeps");
    const AdapterPackage = A.construct("AdapterPackage", {}, ({ name }) =>
      A.in(
        A.rootDirectory,
        A.dir(`packages/adapter-${name}`, {
          repositories: A.dir({
            index: A.file("index.ts", "export {};\n"),
          }),
          packageJson: A.file("package.json", "{}\n"),
        })
      )
    );

    A.construct("Repository", { adapter: AdapterPackage }, ({ name, adapter }) => {
      expectTypeOf(adapter.repositories).not.toBeAny();
      expectTypeOf(adapter.repositories).toExtend<DirRef>();
      expectTypeOf(adapter.repositories.index).toEqualTypeOf<FileRef>();
      expectTypeOf(adapter.packageJson).toEqualTypeOf<FileRef>();
      expectTypeOf(adapter.repositories).toExtend<PlacementDestination>();
      expectTypeOf(adapter).toExtend<PlacementDestination>();
      // @ts-expect-error — undeclared child must not exist on navigable instance
      const _fn = () => adapter.notAChild;

      return A.in(
        adapter.repositories,
        A.file(`${name}.repository.ts`, `export class ${name} {}\n`)
      );
    });
  });

  it("types ModelsModule under core and Shape file-root", () => {
    const A = defineArchitecture("TreeCrossTypes");
    const CorePackage = A.construct("CorePackage", {}, ({ name }) =>
      A.in(
        A.rootDirectory,
        A.dir(`packages/core-${name}`, {
          packageJson: A.file("package.json", "{}\n"),
        })
      )
    );
    const ModelsModule = A.construct("ModelsModule", { core: CorePackage }, ({ core }) => {
      expectTypeOf(core).toExtend<PlacementDestination>();
      expectTypeOf(core.packageJson).toEqualTypeOf<FileRef>();
      return A.in(
        core,
        A.dir("models", {
          index: A.file("index.ts", "export {};\n"),
        })
      );
    });

    const _Shape = A.construct("Shape", { models: ModelsModule }, ({ name, models }) => {
      expectTypeOf(models).toExtend<PlacementDestination>();
      expectTypeOf(models.index).toEqualTypeOf<FileRef>();
      return A.in(models, A.file(`${name}.shape.ts`, `export type ${name} = {};\n`));
    });

    type ShapeInstance = import("./define-architecture").NavigableInstanceRef<typeof _Shape>;
    expectTypeOf<ShapeInstance>().toExtend<FileRef>();
    expectTypeOf<ShapeInstance>().not.toExtend<PlacementDestination>();
  });

  it("types peer-root siblings on the instance", () => {
    const A = defineArchitecture("TreePeerTypes");
    const _WorkspaceRoot = A.construct("WorkspaceRoot", {}, () =>
      A.in(A.rootDirectory, {
        packageJson: A.file("package.json", "{}\n"),
        tsconfig: A.file("tsconfig.json", "{}\n"),
      })
    );

    type Workspace = import("./define-architecture").NavigableInstanceRef<typeof _WorkspaceRoot>;
    expectTypeOf<Workspace["packageJson"]>().toEqualTypeOf<FileRef>();
    expectTypeOf<Workspace["tsconfig"]>().toEqualTypeOf<FileRef>();
    expectTypeOf<Workspace>().toExtend<PlacementDestination>();
  });
});
