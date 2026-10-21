import {
  defineArchitecture,
  dir,
  file,
  filesInDirectory,
  renderTsBarrel,
  root,
  toKebabCase,
  type FileRenderContext,
} from "@xndrjs/struttura";

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
    mode: "scaffold",
    content: workspacePackageJson(),
  }),
  pnpmWorkspace: file({
    filename: "pnpm-workspace.yaml",
    directory: root,
    mode: "scaffold",
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
      mode: "scaffold",
      content: featureSpec(name),
    }),
    design: file({
      filename: "DESIGN.md",
      directory: folder,
      mode: "scaffold",
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
      mode: "scaffold",
      content: (ctx: FileRenderContext) => corePackageJson(ctx.name),
    }),
    readme: file({
      filename: "README.md",
      directory: packageDirectory,
      mode: "scaffold",
      content: coreReadme(name),
    }),
  };
});

export const ModelsModule = A.defineConstruct("ModelsModule", { core: CorePackage })(({ core }) => {
  const models = dir(`${core.artifacts.packageDirectory.path}/models`);
  return {
    models,
    index: file({
      filename: "index.ts",
      directory: models,
      mode: "sync",
      content: (ctx) => renderTsBarrel(ctx, models, { recursive: true }),
    }),
  };
});

export const OperationsModule = A.defineConstruct("OperationsModule", { core: CorePackage })(({
  core,
}) => {
  const operations = dir(`${core.artifacts.packageDirectory.path}/operations`);
  return {
    operations,
    index: file({
      filename: "index.ts",
      directory: operations,
      mode: "sync",
      content: (ctx: FileRenderContext) => renderTsBarrel(ctx, operations, { recursive: true }),
    }),
  };
});

export const UseCasesModule = A.defineConstruct("UseCasesModule", { core: CorePackage })(({
  core,
}) => {
  const useCases = dir(`${core.artifacts.packageDirectory.path}/use-cases`);
  return {
    useCases,
    index: file({
      filename: "index.ts",
      directory: useCases,
      mode: "sync",
      content: (ctx: FileRenderContext) => renderTsBarrel(ctx, useCases, { recursive: true }),
    }),
  };
});

export const PortsModule = A.defineConstruct("PortsModule", { core: CorePackage })(({ core }) => {
  const ports = dir(`${core.artifacts.packageDirectory.path}/ports`);
  return {
    ports,
    index: file({
      filename: "index.ts",
      directory: ports,
      mode: "sync",
      content: (ctx: FileRenderContext) => renderTsBarrel(ctx, ports, { recursive: true }),
    }),
  };
});

export const ErrorsModule = A.defineConstruct("ErrorsModule", { core: CorePackage })(({ core }) => {
  const errors = dir(`${core.artifacts.packageDirectory.path}/errors`);
  return {
    errors,
    index: file({
      filename: "index.ts",
      directory: errors,
      mode: "sync",
      content: (ctx: FileRenderContext) => renderTsBarrel(ctx, errors, { recursive: true }),
    }),
  };
});

export const Shape = A.defineConstruct("Shape", { models: ModelsModule })(({ name, models }) => {
  const kebab = toKebabCase(name);
  return {
    source: file({
      filename: `${kebab}.shape.ts`,
      directory: models.artifacts.models,
      mode: "scaffold",
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
      mode: "scaffold",
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
      mode: "scaffold",
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
      mode: "scaffold",
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
      mode: "scaffold",
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
      mode: "scaffold",
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
      mode: "scaffold",
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
      mode: "scaffold",
      content: useCaseSource(name),
    }),
  };
});

export const InfrastructurePackage = A.defineConstruct("InfrastructurePackage", ({ name }) => {
  const pkg = toKebabCase(name);
  const packageDirectory = dir(`packages/infrastructure-${pkg}`);
  const loaders = dir(`${packageDirectory.path}/loaders`);
  return {
    packageDirectory,
    loaders,
    packageJson: file({
      filename: "package.json",
      directory: packageDirectory,
      mode: "scaffold",
      content: infrastructurePackageJson(name),
    }),
    index: file({
      filename: "index.ts",
      directory: packageDirectory,
      mode: "sync",
      content: (ctx: FileRenderContext) =>
        renderTsBarrel(packageDirectory.path, [...filesInDirectory(ctx, "loaders")]),
    }),
    readme: file({
      filename: "README.md",
      directory: packageDirectory,
      mode: "scaffold",
      content: infrastructureReadme(name),
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
      mode: "scaffold",
      content: infrastructureLoaderSource(name),
    }),
  };
});

export const AdapterPackage = A.defineConstruct("AdapterPackage", {
  infra: InfrastructurePackage,
  core: CorePackage,
})(({ name, infra, core }) => {
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
      mode: "scaffold",
      content: adapterPackageJson({ name, feature: core.name, vendor: infra.name }),
    }),
    index: file({
      filename: "index.ts",
      directory: packageDirectory,
      mode: "sync",
      content: (ctx: FileRenderContext) =>
        renderTsBarrel(packageDirectory.path, [...filesInDirectory(ctx, "repositories")]),
    }),
    readme: file({
      filename: "README.md",
      directory: packageDirectory,
      mode: "scaffold",
      content: adapterReadme({ name, vendor: infra.name, feature: core.name }),
    }),
  };
});

export const Adapter = A.defineConstruct("Adapter", {
  adapter: AdapterPackage,
  port: Port,
  loader: InfrastructureLoader,
  shape: Shape,
})(({ name, adapter, port, loader, shape }) => {
  const kebab = toKebabCase(name);
  const shapeKebab = toKebabCase(shape.name);
  const vendor = loader.dependencies.infra?.name ?? "unknown";
  const modelsModule = shape.dependencies.models;
  const feature = modelsModule?.dependencies.core?.name ?? "unknown";
  return {
    mapper: file({
      filename: `${shapeKebab}.mapper.ts`,
      directory: adapter.artifacts.mappers,
      mode: "scaffold",
      content: adapterMapperSource({ shape: shape.name, feature, loader: loader.name, vendor }),
    }),
    repository: file({
      filename: `${kebab}.repository.ts`,
      directory: adapter.artifacts.repositories,
      mode: "scaffold",
      content: adapterRepositorySource({
        name,
        shape: shape.name,
        port: port.name,
        loader: loader.name,
        vendor,
        feature,
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
      mode: "scaffold",
      content: uiPackageJson(name),
    }),
    index: file({
      filename: "index.ts",
      directory: packageDirectory,
      mode: "scaffold",
      content: uiIndex(name),
    }),
    readme: file({
      filename: "README.md",
      directory: packageDirectory,
      mode: "scaffold",
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
      mode: "scaffold",
      content: appPackageJson(name),
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
      mode: "scaffold",
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
  Adapter,
  UiPackage,
  App,
  CompositionRoot,
};
