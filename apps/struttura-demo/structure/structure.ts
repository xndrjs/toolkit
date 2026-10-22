import { defineStructure, toKebabCase, tsBarrelIndex } from "@xndrjs/struttura";

import * as Templates from "./templates";

const A = defineStructure("CleanArchitectureOrientedMonorepo");

/** Starter statico: l’ex `rootTsconfig(ctx)` usava InventoryQuery. */
const workspaceRootTsconfigStarter = `${JSON.stringify({ files: [], references: [] }, null, 2)}\n`;

/** Sync barrel: export-star managed files under the layer DirRef (Desired inventory). */
const layerBarrel = () => A.file("index.ts", tsBarrelIndex({ recursive: true }), { mode: "sync" });

export const WorkspaceRoot = A.construct("WorkspaceRoot", {}, () =>
  A.in(A.rootDirectory, {
    packageJson: A.file("package.json", Templates.workspacePackageJson()),
    pnpmWorkspace: A.file("pnpm-workspace.yaml", Templates.pnpmWorkspaceYaml()),
    // prima: mode sync + query su tutte le packageDirectory
    tsconfig: A.file("tsconfig.json", workspaceRootTsconfigStarter, {
      mode: "scaffold",
    }),
  })
);

export const FeatureSpec = A.construct("FeatureSpec", {}, ({ name }) =>
  A.in(
    A.rootDirectory,
    A.dir(`specs/${toKebabCase(name)}`, {
      spec: A.file("SPEC.md", Templates.featureSpec(name)),
      design: A.file("DESIGN.md", Templates.featureDesign(name)),
    })
  )
);

export const CorePackage = A.construct("CorePackage", {}, ({ name }) =>
  A.in(
    A.rootDirectory,
    A.dir(`packages/core-${toKebabCase(name)}`, {
      packageJson: A.file("package.json", Templates.corePackageJson(name)),
      tsconfig: A.file("tsconfig.json", Templates.packageTsconfig()),
      readme: A.file("README.md", Templates.coreReadme(name)),
    })
  )
);

export const ModelsModule = A.construct("ModelsModule", { core: CorePackage }, ({ core }) =>
  A.in(
    core,
    A.dir("models", {
      index: layerBarrel(),
    })
  )
);

export const OperationsModule = A.construct("OperationsModule", { core: CorePackage }, ({ core }) =>
  A.in(
    core,
    A.dir("operations", {
      index: layerBarrel(),
    })
  )
);

export const UseCasesModule = A.construct("UseCasesModule", { core: CorePackage }, ({ core }) =>
  A.in(
    core,
    A.dir("use-cases", {
      index: layerBarrel(),
    })
  )
);

export const PortsModule = A.construct("PortsModule", { core: CorePackage }, ({ core }) =>
  A.in(
    core,
    A.dir("ports", {
      index: layerBarrel(),
    })
  )
);

export const ErrorsModule = A.construct("ErrorsModule", { core: CorePackage }, ({ core }) =>
  A.in(
    core,
    A.dir("errors", {
      index: layerBarrel(),
    })
  )
);

export const Shape = A.construct("Shape", { models: ModelsModule }, ({ name, models }) =>
  A.in(models, A.file(`${toKebabCase(name)}.shape.ts`, Templates.shapeSource(name)))
);

export const Primitive = A.construct("Primitive", { models: ModelsModule }, ({ name, models }) =>
  A.in(models, A.file(`${toKebabCase(name)}.primitive.ts`, Templates.primitiveSource(name)))
);

export const Proof = A.construct("Proof", { models: ModelsModule }, ({ name, models }) =>
  A.in(models, A.file(`${toKebabCase(name)}.proof.ts`, Templates.proofSource(name)))
);

export const Capabilities = A.construct(
  "Capabilities",
  { operations: OperationsModule },
  ({ name, operations }) =>
    A.in(
      operations,
      A.file(`${toKebabCase(name)}.capabilities.ts`, Templates.capabilitiesSource(name))
    )
);

export const DomainService = A.construct(
  "DomainService",
  { operations: OperationsModule },
  ({ name, operations }) =>
    A.in(operations, A.file(`${toKebabCase(name)}.service.ts`, Templates.domainServiceSource(name)))
);

export const DomainError = A.construct(
  "DomainError",
  { errors: ErrorsModule },
  ({ name, errors }) =>
    A.in(errors, A.file(`${toKebabCase(name)}.error.ts`, Templates.domainErrorSource(name)))
);

export const Port = A.construct("Port", { ports: PortsModule }, ({ name, ports }) =>
  A.in(ports, A.file(`${toKebabCase(name)}.port.ts`, Templates.portSource(name)))
);

export const UseCase = A.construct("UseCase", { useCases: UseCasesModule }, ({ name, useCases }) =>
  A.in(useCases, A.file(`${toKebabCase(name)}.use-case.ts`, Templates.useCaseSource(name)))
);

export const InfrastructurePackage = A.construct("InfrastructurePackage", {}, ({ name }) =>
  A.in(
    A.rootDirectory,
    A.dir(`packages/infrastructure-${toKebabCase(name)}`, {
      loaders: A.dir({
        index: layerBarrel(),
      }),
      schemas: A.dir({
        index: layerBarrel(),
      }),
      index: A.file("index.ts", 'export * from "./loaders";\nexport * from "./schemas";\n', {
        mode: "sync",
      }),
      readme: A.file("README.md", Templates.infrastructureReadme(name)),
      packageJson: A.file("package.json", Templates.infrastructurePackageJson(name)),
      tsconfig: A.file("tsconfig.json", Templates.packageTsconfig()),
    })
  )
);

export const InfrastructureLoader = A.construct(
  "InfrastructureLoader",
  { infra: InfrastructurePackage },
  ({ name, infra }) =>
    A.in(
      infra.loaders,
      A.file(`${toKebabCase(name)}.loader.ts`, Templates.infrastructureLoaderSource(name))
    )
);

export const AdapterPackage = A.construct(
  "AdapterPackage",
  { core: CorePackage },
  ({ name, core }) =>
    A.in(
      A.rootDirectory,
      A.dir(`packages/adapter-${toKebabCase(name)}`, {
        mappers: A.dir({
          index: layerBarrel(),
        }),
        repositories: A.dir({
          index: layerBarrel(),
        }),
        packageJson: A.file(
          "package.json",
          Templates.adapterPackageJson({ name, feature: core.name })
        ),
        index: A.file("index.ts", 'export * from "./mappers";\nexport * from "./repositories";\n', {
          mode: "sync",
        }),
        readme: A.file("README.md", Templates.adapterReadme({ name, feature: core.name })),
        tsconfig: A.file("tsconfig.json", Templates.packageTsconfig()),
      })
    )
);

export const Mapper = A.construct(
  "Mapper",
  {
    adapter: AdapterPackage,
    shape: Shape,
    core: CorePackage,
  },
  ({ adapter, shape, core }) =>
    A.in(
      adapter.mappers,
      A.file(
        `${toKebabCase(shape.name)}.mapper.ts`,
        Templates.adapterMapperSource({
          shape: shape.name,
          feature: core.name,
        })
      )
    )
);

export const Repository = A.construct(
  "Repository",
  {
    adapter: AdapterPackage,
    shape: Shape,
    core: CorePackage,
  },
  ({ name, adapter, shape, core }) =>
    A.in(
      adapter.repositories,
      A.file(
        `${toKebabCase(name)}.repository.ts`,
        Templates.adapterRepositorySource({
          name,
          shape: shape.name,
          feature: core.name,
        })
      )
    )
);

export const UiPackage = A.construct("UiPackage", {}, ({ name }) =>
  A.in(
    A.rootDirectory,
    A.dir(`packages/ui-${toKebabCase(name)}`, {
      packageJson: A.file("package.json", Templates.uiPackageJson(name)),
      tsconfig: A.file("tsconfig.json", Templates.packageTsconfig()),
      index: A.file("index.ts", Templates.uiIndex(name)),
      readme: A.file("README.md", Templates.uiReadme(name)),
    })
  )
);

export const App = A.construct("App", {}, ({ name }) =>
  A.in(
    A.rootDirectory,
    A.dir(`apps/${toKebabCase(name)}`, {
      composition: A.dir({}),
      packageJson: A.file("package.json", Templates.appPackageJson(name)),
      tsconfig: A.file("tsconfig.json", Templates.packageTsconfig()),
    })
  )
);

export const CompositionRoot = A.construct("CompositionRoot", { app: App }, ({ name, app }) =>
  A.in(
    app.composition,
    A.file(`${toKebabCase(name)}.composition.ts`, Templates.compositionRootSource(name))
  )
);

export const structure = A.seal();

export const constructs = {
  WorkspaceRoot,
  FeatureSpec,
  CorePackage,
  ModelsModule,
  OperationsModule,
  UseCasesModule,
  PortsModule,
  ErrorsModule,
  Shape,
  Primitive,
  Proof,
  Capabilities,
  DomainService,
  DomainError,
  Port,
  UseCase,
  InfrastructurePackage,
  InfrastructureLoader,
  AdapterPackage,
  Mapper,
  Repository,
  UiPackage,
  App,
  CompositionRoot,
};
