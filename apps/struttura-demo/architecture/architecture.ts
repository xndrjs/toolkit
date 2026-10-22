import { defineArchitecture, dir, file, root, toKebabCase, tsBarrelIndex } from "@xndrjs/struttura";

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
import { rootTsconfig } from "./templates/root-tsconfig";
import { shapeSource } from "./templates/shape-source";
import { uiIndex } from "./templates/ui-index";
import { uiPackageJson } from "./templates/ui-package-json";
import { uiReadme } from "./templates/ui-readme";
import { useCaseSource } from "./templates/use-case-source";
import { workspacePackageJson } from "./templates/workspace-package-json";

const A = defineArchitecture("CleanArchitectureOrientedMonorepo");

export const WorkspaceRoot = A.defineConstruct("WorkspaceRoot", () => ({
  packageJson: file({
    filename: "package.json",
    directory: root,
    content: workspacePackageJson(),
  }),
  pnpmWorkspace: file({
    filename: "pnpm-workspace.yaml",
    directory: root,
    content: pnpmWorkspaceYaml(),
  }),
  tsconfig: file({
    filename: "tsconfig.json",
    directory: root,
    mode: "sync",
    content: rootTsconfig,
  }),
}));

export const FeatureSpec = A.defineConstruct("FeatureSpec", ({ name }) => {
  const folder = dir(`specs/${toKebabCase(name)}`);
  return {
    folder,
    spec: file({
      filename: "SPEC.md",
      directory: folder,
      content: featureSpec(name),
    }),
    design: file({
      filename: "DESIGN.md",
      directory: folder,
      content: featureDesign(name),
    }),
  };
});

export const CorePackage = A.defineConstruct("CorePackage", ({ name }) => {
  const feature = toKebabCase(name);
  const packageDirectory = dir(`packages/core-${feature}`);
  return {
    packageDirectory,
    packageJson: file({
      filename: "package.json",
      directory: packageDirectory,
      content: (ctx) => corePackageJson(ctx.name),
    }),
    tsconfig: file({
      filename: "tsconfig.json",
      directory: packageDirectory,
      content: packageTsconfig(),
    }),
    readme: file({
      filename: "README.md",
      directory: packageDirectory,
      content: coreReadme(name),
    }),
  };
});

export const ModelsModule = A.defineConstruct("ModelsModule", { core: CorePackage })(({ core }) => {
  const models = dir(`${core.artifacts.packageDirectory.path}/models`);
  return {
    models,
    index: tsBarrelIndex({ directory: models, recursive: true }),
  };
});

export const OperationsModule = A.defineConstruct("OperationsModule", { core: CorePackage })(({
  core,
}) => {
  const operations = dir(`${core.artifacts.packageDirectory.path}/operations`);
  return {
    operations,
    index: tsBarrelIndex({ directory: operations, recursive: true }),
  };
});

export const UseCasesModule = A.defineConstruct("UseCasesModule", { core: CorePackage })(({
  core,
}) => {
  const useCases = dir(`${core.artifacts.packageDirectory.path}/use-cases`);
  return {
    useCases,
    index: tsBarrelIndex({ directory: useCases, recursive: true }),
  };
});

export const PortsModule = A.defineConstruct("PortsModule", { core: CorePackage })(({ core }) => {
  const ports = dir(`${core.artifacts.packageDirectory.path}/ports`);
  return {
    ports,
    index: tsBarrelIndex({ directory: ports, recursive: true }),
  };
});

export const ErrorsModule = A.defineConstruct("ErrorsModule", { core: CorePackage })(({ core }) => {
  const errors = dir(`${core.artifacts.packageDirectory.path}/errors`);
  return {
    errors,
    index: tsBarrelIndex({ directory: errors, recursive: true }),
  };
});

export const Shape = A.defineConstruct("Shape", { models: ModelsModule })(({ name, models }) => {
  const kebab = toKebabCase(name);
  return {
    source: file({
      filename: `${kebab}.shape.ts`,
      directory: models.artifacts.models,
      content: shapeSource(name),
    }),
  };
});

export const Primitive = A.defineConstruct("Primitive", { models: ModelsModule })(({
  name,
  models,
}) => {
  const kebab = toKebabCase(name);
  return {
    source: file({
      filename: `${kebab}.primitive.ts`,
      directory: models.artifacts.models,
      content: primitiveSource(name),
    }),
  };
});

export const Proof = A.defineConstruct("Proof", { models: ModelsModule })(({ name, models }) => {
  const kebab = toKebabCase(name);
  return {
    source: file({
      filename: `${kebab}.proof.ts`,
      directory: models.artifacts.models,
      content: proofSource(name),
    }),
  };
});

export const Capabilities = A.defineConstruct("Capabilities", { operations: OperationsModule })(({
  name,
  operations,
}) => {
  const kebab = toKebabCase(name);
  return {
    source: file({
      filename: `${kebab}.capabilities.ts`,
      directory: operations.artifacts.operations,
      content: capabilitiesSource(name),
    }),
  };
});

export const DomainService = A.defineConstruct("DomainService", { operations: OperationsModule })(({
  name,
  operations,
}) => {
  const kebab = toKebabCase(name);
  return {
    source: file({
      filename: `${kebab}.service.ts`,
      directory: operations.artifacts.operations,
      content: domainServiceSource(name),
    }),
  };
});

export const DomainError = A.defineConstruct("DomainError", { errors: ErrorsModule })(({
  name,
  errors,
}) => {
  const kebab = toKebabCase(name);
  return {
    source: file({
      filename: `${kebab}.error.ts`,
      directory: errors.artifacts.errors,
      content: domainErrorSource(name),
    }),
  };
});

export const Port = A.defineConstruct("Port", { ports: PortsModule })(({ name, ports }) => {
  const kebab = toKebabCase(name);
  return {
    source: file({
      filename: `${kebab}.port.ts`,
      directory: ports.artifacts.ports,
      content: portSource(name),
    }),
  };
});

export const UseCase = A.defineConstruct("UseCase", { useCases: UseCasesModule })(({
  name,
  useCases,
}) => {
  const kebab = toKebabCase(name);
  return {
    source: file({
      filename: `${kebab}.use-case.ts`,
      directory: useCases.artifacts.useCases,
      content: useCaseSource(name),
    }),
  };
});

export const InfrastructurePackage = A.defineConstruct("InfrastructurePackage", ({ name }) => {
  const pkg = toKebabCase(name);
  const packageDirectory = dir(`packages/infrastructure-${pkg}`);
  const loaders = dir(`${packageDirectory.path}/loaders`);
  const schemas = dir(`${packageDirectory.path}/schemas`);
  return {
    packageDirectory,
    loaders,
    schemas,
    loadersIndex: tsBarrelIndex({ directory: loaders, recursive: true }),
    schemasIndex: tsBarrelIndex({ directory: schemas, recursive: true }),
    index: file({
      filename: "index.ts",
      directory: packageDirectory,
      mode: "sync",
      content: 'export * from "./loaders";\nexport * from "./schemas";\n',
    }),
    readme: file({
      filename: "README.md",
      directory: packageDirectory,
      content: infrastructureReadme(name),
    }),
    packageJson: file({
      filename: "package.json",
      directory: packageDirectory,
      content: infrastructurePackageJson(name),
    }),
    tsconfig: file({
      filename: "tsconfig.json",
      directory: packageDirectory,
      content: packageTsconfig(),
    }),
  };
});

export const InfrastructureLoader = A.defineConstruct("InfrastructureLoader", {
  infra: InfrastructurePackage,
})(({ name, infra }) => {
  const kebab = toKebabCase(name);
  return {
    source: file({
      filename: `${kebab}.loader.ts`,
      directory: infra.artifacts.loaders,
      content: infrastructureLoaderSource(name),
    }),
  };
});

export const AdapterPackage = A.defineConstruct("AdapterPackage", {
  core: CorePackage,
})(({ name, core }) => {
  const pkg = toKebabCase(name);
  const packageDirectory = dir(`packages/adapter-${pkg}`);
  const mappers = dir(`${packageDirectory.path}/mappers`);
  const repositories = dir(`${packageDirectory.path}/repositories`);
  return {
    packageDirectory,
    mappers,
    repositories,
    packageJson: file({
      filename: "package.json",
      directory: packageDirectory,
      content: adapterPackageJson({ name, feature: core.name }),
    }),
    mappersIndex: tsBarrelIndex({ directory: mappers, recursive: true }),
    repositoriesIndex: tsBarrelIndex({ directory: repositories, recursive: true }),
    index: file({
      filename: "index.ts",
      directory: packageDirectory,
      mode: "sync",
      content: 'export * from "./mappers";\nexport * from "./repositories";\n',
    }),
    readme: file({
      filename: "README.md",
      directory: packageDirectory,
      content: adapterReadme({ name, feature: core.name }),
    }),
    tsconfig: file({
      filename: "tsconfig.json",
      directory: packageDirectory,
      content: packageTsconfig(),
    }),
  };
});

/**
 * Maps vendor raw data onto one core shape (under AdapterPackage mappers/).
 * Which infrastructure packages / raw types are authored — not construct deps.
 */
export const Mapper = A.defineConstruct("Mapper", {
  adapter: AdapterPackage,
  shape: Shape,
  core: CorePackage,
})(({ adapter, shape, core }) => {
  const shapeKebab = toKebabCase(shape.name);
  return {
    source: file({
      filename: `${shapeKebab}.mapper.ts`,
      directory: adapter.artifacts.mappers,
      content: adapterMapperSource({
        shape: shape.name,
        feature: core.name,
      }),
    }),
  };
});

/**
 * Adapter-side repository kit toward one core shape (under AdapterPackage
 * repositories/). Loaders, ports, and vendors are authored — not construct deps.
 */
export const Repository = A.defineConstruct("Repository", {
  adapter: AdapterPackage,
  shape: Shape,
  core: CorePackage,
})(({ name, adapter, shape, core }) => {
  const kebab = toKebabCase(name);
  return {
    source: file({
      filename: `${kebab}.repository.ts`,
      directory: adapter.artifacts.repositories,
      content: adapterRepositorySource({
        name,
        shape: shape.name,
        feature: core.name,
      }),
    }),
  };
});

export const UiPackage = A.defineConstruct("UiPackage", ({ name }) => {
  const pkg = toKebabCase(name);
  const packageDirectory = dir(`packages/ui-${pkg}`);
  return {
    packageDirectory,
    packageJson: file({
      filename: "package.json",
      directory: packageDirectory,
      content: uiPackageJson(name),
    }),
    tsconfig: file({
      filename: "tsconfig.json",
      directory: packageDirectory,
      content: packageTsconfig(),
    }),
    index: file({
      filename: "index.ts",
      directory: packageDirectory,
      content: uiIndex(name),
    }),
    readme: file({
      filename: "README.md",
      directory: packageDirectory,
      content: uiReadme(name),
    }),
  };
});

export const App = A.defineConstruct("App", ({ name }) => {
  const app = toKebabCase(name);
  const packageDirectory = dir(`apps/${app}`);
  const composition = dir(`${packageDirectory.path}/composition`);
  return {
    packageDirectory,
    composition,
    packageJson: file({
      filename: "package.json",
      directory: packageDirectory,
      content: appPackageJson(name),
    }),
    tsconfig: file({
      filename: "tsconfig.json",
      directory: packageDirectory,
      content: packageTsconfig(),
    }),
  };
});

export const CompositionRoot = A.defineConstruct("CompositionRoot", { app: App })(({
  name,
  app,
}) => {
  return {
    source: file({
      filename: `${toKebabCase(name)}.composition.ts`,
      directory: app.artifacts.composition,
      content: compositionRootSource(name),
    }),
  };
});

export const architecture = A.seal();

/** Named map for codegen — keeps construct keys definite for TypeScript. */
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
