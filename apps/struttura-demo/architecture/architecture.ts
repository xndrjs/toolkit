import { defineArchitecture, toKebabCase } from "@xndrjs/struttura";

import { adapterMapperSource } from "./templates/adapter-mapper-source";
import { adapterPackageJson } from "./templates/adapter-package-json";
import { adapterReadme } from "./templates/adapter-readme";
import { adapterRepositorySource } from "./templates/adapter-repository-source";
import { appPackageJson } from "./templates/app-package-json";
import { capabilitiesSource } from "./templates/capabilities-source";
import { compositionRootSource } from "./templates/composition-root-source";
import { corePackageJson } from "./templates/core-package-json";
import { coreReadme } from "./templates/core-readme";
import { domainErrorSource } from "./templates/domain-error-source";
import { domainServiceSource } from "./templates/domain-service-source";
import { featureDesign } from "./templates/feature-design";
import { featureSpec } from "./templates/feature-spec";
import { infrastructureLoaderSource } from "./templates/infrastructure-loader-source";
import { infrastructurePackageJson } from "./templates/infrastructure-package-json";
import { infrastructureReadme } from "./templates/infrastructure-readme";
import { packageTsconfig } from "./templates/package-tsconfig";
import { pnpmWorkspaceYaml } from "./templates/pnpm-workspace-yaml";
import { portSource } from "./templates/port-source";
import { primitiveSource } from "./templates/primitive-source";
import { proofSource } from "./templates/proof-source";
import { shapeSource } from "./templates/shape-source";
import { uiIndex } from "./templates/ui-index";
import { uiPackageJson } from "./templates/ui-package-json";
import { uiReadme } from "./templates/ui-readme";
import { useCaseSource } from "./templates/use-case-source";
import { workspacePackageJson } from "./templates/workspace-package-json";

const A = defineArchitecture("CleanArchitectureOrientedMonorepo");

/** Starter statico: l’ex `rootTsconfig(ctx)` usava InventoryQuery. */
const workspaceRootTsconfigStarter = `${JSON.stringify({ files: [], references: [] }, null, 2)}\n`;

const emptyBarrel = "export {};\n";

export const WorkspaceRoot = A.construct("WorkspaceRoot", {}, () =>
  A.in(A.rootDirectory, {
    packageJson: A.file("package.json", workspacePackageJson()),
    pnpmWorkspace: A.file("pnpm-workspace.yaml", pnpmWorkspaceYaml()),
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
      spec: A.file("SPEC.md", featureSpec(name)),
      design: A.file("DESIGN.md", featureDesign(name)),
    })
  )
);

export const CorePackage = A.construct("CorePackage", {}, ({ name }) =>
  A.in(
    A.rootDirectory,
    A.dir(`packages/core-${toKebabCase(name)}`, {
      packageJson: A.file("package.json", corePackageJson(name)),
      tsconfig: A.file("tsconfig.json", packageTsconfig()),
      readme: A.file("README.md", coreReadme(name)),
    })
  )
);

export const ModelsModule = A.construct("ModelsModule", { core: CorePackage }, ({ core }) =>
  A.in(
    core,
    A.dir("models", {
      index: A.file("index.ts", emptyBarrel),
    })
  )
);

export const OperationsModule = A.construct("OperationsModule", { core: CorePackage }, ({ core }) =>
  A.in(
    core,
    A.dir("operations", {
      index: A.file("index.ts", emptyBarrel),
    })
  )
);

export const UseCasesModule = A.construct("UseCasesModule", { core: CorePackage }, ({ core }) =>
  A.in(
    core,
    A.dir("use-cases", {
      index: A.file("index.ts", emptyBarrel),
    })
  )
);

export const PortsModule = A.construct("PortsModule", { core: CorePackage }, ({ core }) =>
  A.in(
    core,
    A.dir("ports", {
      index: A.file("index.ts", emptyBarrel),
    })
  )
);

export const ErrorsModule = A.construct("ErrorsModule", { core: CorePackage }, ({ core }) =>
  A.in(
    core,
    A.dir("errors", {
      index: A.file("index.ts", emptyBarrel),
    })
  )
);

export const Shape = A.construct("Shape", { models: ModelsModule }, ({ name, models }) =>
  A.in(models, A.file(`${toKebabCase(name)}.shape.ts`, shapeSource(name)))
);

export const Primitive = A.construct("Primitive", { models: ModelsModule }, ({ name, models }) =>
  A.in(models, A.file(`${toKebabCase(name)}.primitive.ts`, primitiveSource(name)))
);

export const Proof = A.construct("Proof", { models: ModelsModule }, ({ name, models }) =>
  A.in(models, A.file(`${toKebabCase(name)}.proof.ts`, proofSource(name)))
);

export const Capabilities = A.construct(
  "Capabilities",
  { operations: OperationsModule },
  ({ name, operations }) =>
    A.in(operations, A.file(`${toKebabCase(name)}.capabilities.ts`, capabilitiesSource(name)))
);

export const DomainService = A.construct(
  "DomainService",
  { operations: OperationsModule },
  ({ name, operations }) =>
    A.in(operations, A.file(`${toKebabCase(name)}.service.ts`, domainServiceSource(name)))
);

export const DomainError = A.construct(
  "DomainError",
  { errors: ErrorsModule },
  ({ name, errors }) =>
    A.in(errors, A.file(`${toKebabCase(name)}.error.ts`, domainErrorSource(name)))
);

export const Port = A.construct("Port", { ports: PortsModule }, ({ name, ports }) =>
  A.in(ports, A.file(`${toKebabCase(name)}.port.ts`, portSource(name)))
);

export const UseCase = A.construct("UseCase", { useCases: UseCasesModule }, ({ name, useCases }) =>
  A.in(useCases, A.file(`${toKebabCase(name)}.use-case.ts`, useCaseSource(name)))
);

export const InfrastructurePackage = A.construct("InfrastructurePackage", {}, ({ name }) =>
  A.in(
    A.rootDirectory,
    A.dir(`packages/infrastructure-${toKebabCase(name)}`, {
      loaders: A.dir({
        index: A.file("index.ts", emptyBarrel),
      }),
      schemas: A.dir({
        index: A.file("index.ts", emptyBarrel),
      }),
      index: A.file("index.ts", 'export * from "./loaders";\nexport * from "./schemas";\n', {
        mode: "sync",
      }),
      readme: A.file("README.md", infrastructureReadme(name)),
      packageJson: A.file("package.json", infrastructurePackageJson(name)),
      tsconfig: A.file("tsconfig.json", packageTsconfig()),
    })
  )
);

export const InfrastructureLoader = A.construct(
  "InfrastructureLoader",
  { infra: InfrastructurePackage },
  ({ name, infra }) =>
    A.in(infra.loaders, A.file(`${toKebabCase(name)}.loader.ts`, infrastructureLoaderSource(name)))
);

export const AdapterPackage = A.construct(
  "AdapterPackage",
  { core: CorePackage },
  ({ name, core }) =>
    A.in(
      A.rootDirectory,
      A.dir(`packages/adapter-${toKebabCase(name)}`, {
        mappers: A.dir({
          index: A.file("index.ts", emptyBarrel),
        }),
        repositories: A.dir({
          index: A.file("index.ts", emptyBarrel),
        }),
        packageJson: A.file("package.json", adapterPackageJson({ name, feature: core.name })),
        index: A.file("index.ts", 'export * from "./mappers";\nexport * from "./repositories";\n', {
          mode: "sync",
        }),
        readme: A.file("README.md", adapterReadme({ name, feature: core.name })),
        tsconfig: A.file("tsconfig.json", packageTsconfig()),
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
        adapterMapperSource({
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
        adapterRepositorySource({
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
      packageJson: A.file("package.json", uiPackageJson(name)),
      tsconfig: A.file("tsconfig.json", packageTsconfig()),
      index: A.file("index.ts", uiIndex(name)),
      readme: A.file("README.md", uiReadme(name)),
    })
  )
);

export const App = A.construct("App", {}, ({ name }) =>
  A.in(
    A.rootDirectory,
    A.dir(`apps/${toKebabCase(name)}`, {
      composition: A.dir({}),
      packageJson: A.file("package.json", appPackageJson(name)),
      tsconfig: A.file("tsconfig.json", packageTsconfig()),
    })
  )
);

export const CompositionRoot = A.construct("CompositionRoot", { app: App }, ({ name, app }) =>
  A.in(app.composition, A.file(`${toKebabCase(name)}.composition.ts`, compositionRootSource(name)))
);

export const architecture = A.seal();

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
