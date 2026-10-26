import { describe, expectTypeOf, it } from "vitest";

import {
  array,
  defineStructure,
  type DirRef,
  type FileRef,
  type PlacementDestination,
} from "./define-structure";

describe("construct navigable dependency children", () => {
  it("types adapter.repositories as DirRef from declared tree children", () => {
    const A = defineStructure("TreeNavDeps");
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
    const A = defineStructure("TreeCrossTypes");
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

    type ShapeInstance = import("./define-structure").NavigableInstanceRef<typeof _Shape>;
    expectTypeOf<ShapeInstance>().toExtend<FileRef>();
    expectTypeOf<ShapeInstance>().not.toExtend<PlacementDestination>();
  });

  it("types peer-root siblings on the instance", () => {
    const A = defineStructure("TreePeerTypes");
    const _WorkspaceRoot = A.construct("WorkspaceRoot", {}, () =>
      A.in(A.rootDirectory, {
        packageJson: A.file("package.json", "{}\n"),
        tsconfig: A.file("tsconfig.json", "{}\n"),
      })
    );

    type Workspace = import("./define-structure").NavigableInstanceRef<typeof _WorkspaceRoot>;
    expectTypeOf<Workspace["packageJson"]>().toEqualTypeOf<FileRef>();
    expectTypeOf<Workspace["tsconfig"]>().toEqualTypeOf<FileRef>();
    expectTypeOf<Workspace>().toExtend<PlacementDestination>();
  });

  it("rejects A.construct with only two arguments (deps always required)", () => {
    const A = defineStructure("TwoArgConstruct");
    // Type-only: never invoked — construct requires (name, dependencies, build).
    const _rejectTwoArgForm = () => {
      // @ts-expect-error — no 2-arg overload; deps map is always required
      A.construct("Bad", () => A.in(A.rootDirectory, A.file("x.ts", "")));
    };
    expectTypeOf(_rejectTwoArgForm).toBeFunction();
  });

  it("types no-deps context as name/id only", () => {
    const A = defineStructure("NoDeps");
    A.construct("Pkg", {}, (ctx) => {
      expectTypeOf(ctx.name).toEqualTypeOf<string>();
      expectTypeOf(ctx.id).toEqualTypeOf<string>();
      return A.in(A.rootDirectory, A.dir("pkg", {}));
    });
  });

  it("types nested .dependencies from the construct dep map (ModelsModule → core)", () => {
    const A = defineStructure("DepMapTypes");
    const CorePackage = A.construct("CorePackage", {}, ({ name }) =>
      A.in(
        A.rootDirectory,
        A.dir(`packages/core-${name}`, {
          packageJson: A.file("package.json", "{}\n"),
        })
      )
    );
    const ModelsModule = A.construct("ModelsModule", { core: CorePackage }, ({ core }) =>
      A.in(
        core,
        A.dir("models", {
          index: A.file("index.ts", "export {};\n"),
        })
      )
    );

    A.construct("Shape", { models: ModelsModule }, ({ models }) => {
      type CoreInstance = import("./define-structure").NavigableInstanceRef<typeof CorePackage>;

      // Desired: dependencies keyed like the construct map, values = navigable instances.
      expectTypeOf(models.dependencies).toEqualTypeOf<{
        readonly core: CoreInstance;
      }>();

      expectTypeOf(models.dependencies.core).toEqualTypeOf<CoreInstance>();
      expectTypeOf(models.dependencies.core.packageJson).toEqualTypeOf<FileRef>();

      // Desired: unknown dep keys are not allowed (Record<string, …> allows them today).
      // @ts-expect-error — only declared deps (core) exist on models.dependencies
      const _bad = models.dependencies.notADep;

      return A.in(models, A.file("x.shape.ts", "export type X = {};\n"));
    });
  });

  it("types array(C) dependency slots as readonly navigable instance arrays", () => {
    const A = defineStructure("ManyDepTypes");
    const CorePackage = A.construct("CorePackage", {}, ({ name }) =>
      A.in(
        A.rootDirectory,
        A.dir(`packages/core-${name}`, {
          packageJson: A.file("package.json", "{}\n"),
        })
      )
    );

    A.construct("CoreCatalog", { cores: array(CorePackage) }, ({ cores }) => {
      type CoreInstance = import("./define-structure").NavigableInstanceRef<typeof CorePackage>;

      expectTypeOf(cores).toEqualTypeOf<readonly CoreInstance[]>();
      expectTypeOf(cores[0]).toEqualTypeOf<CoreInstance | undefined>();
      if (cores[0]) {
        expectTypeOf(cores[0].packageJson).toEqualTypeOf<FileRef>();
      }

      return A.in(
        A.rootDirectory,
        A.file("catalog.ts", () => `export const n = ${String(cores.length)};\n`, { mode: "sync" })
      );
    });
  });
});
