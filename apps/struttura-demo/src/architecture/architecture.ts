import {
  defineArchitecture,
  dir,
  file,
  filesInDirectory,
  renderTsBarrel,
  root,
  toKebabCase,
  toPascalCase,
  type FileRenderContext,
} from "@xndrjs/struttura";

function corePackageJson(featureName: string): string {
  const feature = toKebabCase(featureName);
  return `${JSON.stringify(
    {
      name: `@core/${feature}`,
      private: true,
      type: "module",
      exports: {
        "./models": "./models/index.ts",
        "./operations": "./operations/index.ts",
        "./use-cases": "./use-cases/index.ts",
        "./ports": "./ports/index.ts",
        "./errors": "./errors/index.ts",
      },
      sideEffects: false,
      dependencies: {
        "@xndrjs/domain": "workspace:*",
        "@xndrjs/domain-zod": "workspace:*",
        zod: "^4.0.0",
      },
    },
    null,
    2
  )}\n`;
}

/** Solution-style root tsconfig: references every App / package packageDirectory. */
function renderRootTsconfig(ctx: FileRenderContext): string {
  const packageConstructs = ["App", "CorePackage", "InfrastructurePackage", "UiPackage"] as const;
  const paths = new Set<string>();
  for (const constructName of packageConstructs) {
    for (const instance of ctx.query.instances(constructName)) {
      const packageDirectory = ctx.query
        .artifacts(instance)
        .find(
          (artifact) => artifact.artifactKey === "packageDirectory" && artifact.kind === "directory"
        );
      if (packageDirectory) {
        paths.add(`./${packageDirectory.path}`);
      }
    }
  }
  return `${JSON.stringify(
    {
      files: [],
      references: [...paths].sort().map((path) => ({ path })),
    },
    null,
    2
  )}\n`;
}

const A = defineArchitecture("CleanArchitectureOrientedMonorepo");

export const WorkspaceRoot = A.defineConstruct("WorkspaceRoot", () => ({
  packageJson: file({
    filename: "package.json",
    directory: root,
    mode: "scaffold",
    content: `${JSON.stringify(
      {
        name: "struttura-demo-project",
        private: true,
        type: "module",
        scripts: {
          typecheck: "tsc -b",
          test: "vitest run",
        },
      },
      null,
      2
    )}\n`,
  }),
  pnpmWorkspace: file({
    filename: "pnpm-workspace.yaml",
    directory: root,
    mode: "scaffold",
    content: `packages:
  - "apps/*"
  - "packages/*"
`,
  }),
  tsconfig: file({
    filename: "tsconfig.json",
    directory: root,
    mode: "sync",
    content: renderRootTsconfig,
  }),
}));

export const FeatureSpec = A.defineConstruct("FeatureSpec", ({ name }) => {
  const folder = dir(`specs/${toKebabCase(name)}`);
  const title = toPascalCase(name);
  return {
    folder,
    spec: file({
      filename: "SPEC.md",
      directory: folder,
      mode: "scaffold",
      content: `# ${title} — SPEC

What the feature does in domain language (no vendor terms).
`,
    }),
    design: file({
      filename: "DESIGN.md",
      directory: folder,
      mode: "scaffold",
      content: `# ${title} — DESIGN

How it maps to @core kits, operations, use cases, ports, and @infrastructure adapters.
`,
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
      content: `# @core/${feature}

## Purpose

What business capability does this bounded context own?
`,
    }),
  };
});

export const ModelsModule = A.defineConstruct("ModelsModule", { core: CorePackage }, ({ core }) => {
  const models = dir(`${core.artifacts.packageDirectory.path}/models`);
  return {
    models,
    index: file({
      filename: "index.ts",
      directory: models,
      mode: "sync",
      content: (ctx) => renderTsBarrel(ctx, models),
    }),
  };
});

export const OperationsModule = A.defineConstruct(
  "OperationsModule",
  { core: CorePackage },
  ({ core }) => {
    const operations = dir(`${core.artifacts.packageDirectory.path}/operations`);
    return {
      operations,
      index: file({
        filename: "index.ts",
        directory: operations,
        mode: "sync",
        content: (ctx: FileRenderContext) => renderTsBarrel(ctx, operations),
      }),
    };
  }
);

export const UseCasesModule = A.defineConstruct(
  "UseCasesModule",
  { core: CorePackage },
  ({ core }) => {
    const useCases = dir(`${core.artifacts.packageDirectory.path}/use-cases`);
    return {
      useCases,
      index: file({
        filename: "index.ts",
        directory: useCases,
        mode: "sync",
        content: (ctx: FileRenderContext) => renderTsBarrel(ctx, useCases),
      }),
    };
  }
);

export const PortsModule = A.defineConstruct("PortsModule", { core: CorePackage }, ({ core }) => {
  const ports = dir(`${core.artifacts.packageDirectory.path}/ports`);
  return {
    ports,
    index: file({
      filename: "index.ts",
      directory: ports,
      mode: "sync",
      content: (ctx: FileRenderContext) => renderTsBarrel(ctx, ports),
    }),
  };
});

export const ErrorsModule = A.defineConstruct("ErrorsModule", { core: CorePackage }, ({ core }) => {
  const errors = dir(`${core.artifacts.packageDirectory.path}/errors`);
  return {
    errors,
    index: file({
      filename: "index.ts",
      directory: errors,
      mode: "sync",
      content: (ctx: FileRenderContext) => renderTsBarrel(ctx, errors),
    }),
  };
});

export const Shape = A.defineConstruct("Shape", { models: ModelsModule }, ({ name, models }) => {
  const pascal = toPascalCase(name);
  const kebab = toKebabCase(name);
  return {
    source: file({
      filename: `${kebab}.shape.ts`,
      directory: models.artifacts.models,
      mode: "scaffold",
      content: `import { domain } from "@xndrjs/domain-zod";
import { z } from "zod";

export const ${pascal}Shape = domain.shape(
  "${pascal}",
  z.object({
    kind: z.literal("${pascal}").default("${pascal}"),
    // TODO: define shape fields
  }),
);

export type ${pascal} = ReturnType<(typeof ${pascal}Shape)["create"]>;
`,
    }),
  };
});

export const Primitive = A.defineConstruct(
  "Primitive",
  { models: ModelsModule },
  ({ name, models }) => {
    const pascal = toPascalCase(name);
    const kebab = toKebabCase(name);
    return {
      source: file({
        filename: `${kebab}.primitive.ts`,
        directory: models.artifacts.models,
        mode: "scaffold",
        content: `import { domain } from "@xndrjs/domain-zod";
import { z } from "zod";

export const ${pascal}Primitive = domain.primitive(
  "${pascal}",
  z.string(),
);

export type ${pascal} = ReturnType<(typeof ${pascal}Primitive)["create"]>;
`,
      }),
    };
  }
);

export const Proof = A.defineConstruct("Proof", { models: ModelsModule }, ({ name, models }) => {
  const pascal = toPascalCase(name);
  const kebab = toKebabCase(name);
  return {
    source: file({
      filename: `${kebab}.proof.ts`,
      directory: models.artifacts.models,
      mode: "scaffold",
      content: `import { domain } from "@xndrjs/domain-zod";
import { z } from "zod";

export const ${pascal}Proof = domain
  .proof(
    "${pascal}",
    z.object({
      // TODO: define proof baseline schema
    }),
  )
  .refineType((row): row is typeof row & { /* TODO */ } => {
    return true;
  });

export type ${pascal} = ReturnType<(typeof ${pascal}Proof)["assert"]>;
`,
    }),
  };
});

export const Capabilities = A.defineConstruct(
  "Capabilities",
  { operations: OperationsModule },
  ({ name, operations }) => {
    const pascal = toPascalCase(name);
    const kebab = toKebabCase(name);
    return {
      source: file({
        filename: `${kebab}.capabilities.ts`,
        directory: operations.artifacts.operations,
        mode: "scaffold",
        content: `import { domain } from "@xndrjs/domain-zod";
import { ${pascal}Shape } from "../models/${kebab}.shape";

export const ${pascal}Capabilities = domain.capabilities
  .forShapeKit(${pascal}Shape)
  .methods(({ patch }) => ({
    // TODO: add capabilities
  }));
`,
      }),
    };
  }
);

export const DomainService = A.defineConstruct(
  "DomainService",
  { operations: OperationsModule },
  ({ name, operations }) => {
    const pascal = toPascalCase(name);
    const kebab = toKebabCase(name);
    const camel = pascal.charAt(0).toLowerCase() + pascal.slice(1);
    return {
      source: file({
        filename: `${kebab}.service.ts`,
        directory: operations.artifacts.operations,
        mode: "scaffold",
        content: `/** Cross-model domain logic for ${pascal} (pure functions). */
export function ${camel}Service() {
  // TODO: implement domain service
}
`,
      }),
    };
  }
);

export const DomainError = A.defineConstruct(
  "DomainError",
  { errors: ErrorsModule },
  ({ name, errors }) => {
    const pascal = toPascalCase(name);
    const kebab = toKebabCase(name);
    const code = kebab.replaceAll("-", "_").toUpperCase();
    return {
      source: file({
        filename: `${kebab}.error.ts`,
        directory: errors.artifacts.errors,
        mode: "scaffold",
        content: `export class ${pascal}Error extends Error {
  readonly code = "${code}" as const;

  constructor(message = "${pascal}") {
    super(message);
    this.name = "${pascal}Error";
  }
}
`,
      }),
    };
  }
);

export const Port = A.defineConstruct("Port", { ports: PortsModule }, ({ name, ports }) => {
  const pascal = toPascalCase(name);
  const kebab = toKebabCase(name);
  return {
    source: file({
      filename: `${kebab}.port.ts`,
      directory: ports.artifacts.ports,
      mode: "scaffold",
      content: `export interface ${pascal}Port {}
`,
    }),
  };
});

export const UseCase = A.defineConstruct(
  "UseCase",
  { useCases: UseCasesModule },
  ({ name, useCases }) => {
    const pascal = toPascalCase(name);
    const kebab = toKebabCase(name);
    const camel = pascal.charAt(0).toLowerCase() + pascal.slice(1);
    return {
      source: file({
        filename: `${kebab}.use-case.ts`,
        directory: useCases.artifacts.useCases,
        mode: "scaffold",
        content: `/**
 * Use case "${camel}"
 * Wire in the app composition root (e.g. getWebServerRoot(ctx).${camel}).
 */
export interface ${pascal}UseCaseDeps {
  // Add required ports here.
}

export function create${pascal}UseCase(_deps: ${pascal}UseCaseDeps) {
  return async function ${camel}() {
    throw new Error("Not implemented: ${pascal} use case");
  };
}
`,
      }),
    };
  }
);

export const InfrastructurePackage = A.defineConstruct("InfrastructurePackage", ({ name }) => {
  const pkg = toKebabCase(name);
  const packageDirectory = dir(`packages/infrastructure-${pkg}`);
  const loaders = dir(`${packageDirectory.path}/loaders`);
  const repositories = dir(`${packageDirectory.path}/repositories`);
  const mappers = dir(`${packageDirectory.path}/mappers`);
  return {
    packageDirectory,
    loaders,
    repositories,
    mappers,
    packageJson: file({
      filename: "package.json",
      directory: packageDirectory,
      mode: "scaffold",
      content: `${JSON.stringify(
        {
          name: `@infrastructure/${pkg}`,
          private: true,
          type: "module",
          exports: { ".": "./index.ts" },
        },
        null,
        2
      )}\n`,
    }),
    index: file({
      filename: "index.ts",
      directory: packageDirectory,
      mode: "sync",
      content: (ctx: FileRenderContext) =>
        renderTsBarrel(packageDirectory.path, [
          ...filesInDirectory(ctx, "loaders"),
          ...filesInDirectory(ctx, "repositories"),
        ]),
    }),
    readme: file({
      filename: "README.md",
      directory: packageDirectory,
      mode: "scaffold",
      content: `# @infrastructure/${pkg}

Adapters for ${pkg}.
`,
    }),
  };
});

export const InfrastructureLoader = A.defineConstruct(
  "InfrastructureLoader",
  { infra: InfrastructurePackage },
  ({ name, infra }) => {
    const pascal = toPascalCase(name);
    const kebab = toKebabCase(name);
    const camel = pascal.charAt(0).toLowerCase() + pascal.slice(1);
    return {
      source: file({
        filename: `${kebab}.loader.ts`,
        directory: infra.artifacts.loaders,
        mode: "scaffold",
        content: `/**
 * Loader "${camel}"
 *
 * Fetches raw ${pascal} records from an external service.
 * Knows only the infrastructural shape — no @core/* types.
 */
export type Raw${pascal} = {
  // TODO: vendor-specific fields
};

export type ${pascal}LoaderDeps = {
  // client: VendorClient;
};

export class ${pascal}Loader {
  constructor(private readonly deps: ${pascal}LoaderDeps) {}

  async get(id: string): Promise<Raw${pascal} | null> {
    throw new Error("Not implemented: ${pascal}Loader.get");
  }

  async getMany(ids: string[]): Promise<Raw${pascal}[]> {
    throw new Error("Not implemented: ${pascal}Loader.getMany");
  }
}
`,
      }),
    };
  }
);

export const InfrastructureRepository = A.defineConstruct(
  "InfrastructureRepository",
  {
    infra: InfrastructurePackage,
    port: Port,
    loader: InfrastructureLoader,
    shape: Shape,
  },
  ({ name, infra, port, loader, shape }) => {
    const pascal = toPascalCase(name);
    const kebab = toKebabCase(name);
    const shapePascal = toPascalCase(shape.name);
    const shapeKebab = toKebabCase(shape.name);
    const portPascal = toPascalCase(port.name);
    const loaderPascal = toPascalCase(loader.name);
    const loaderKebab = toKebabCase(loader.name);
    const loaderCamel = loaderPascal.charAt(0).toLowerCase() + loaderPascal.slice(1);
    const modelsModule = shape.dependencies.models;
    const coreInstance = modelsModule?.dependencies.core;
    const coreFeature = toKebabCase(coreInstance?.name ?? "unknown");
    return {
      mapper: file({
        filename: `${shapeKebab}.mapper.ts`,
        directory: infra.artifacts.mappers,
        mode: "scaffold",
        content: `import type { ${shapePascal} } from "@core/${coreFeature}/models";
import type { Raw${loaderPascal} } from "../loaders/${loaderKebab}.loader";

export function mapRawTo${shapePascal}(raw: Raw${loaderPascal}): ${shapePascal} {
  void raw;
  throw new Error("Not implemented: mapRawTo${shapePascal}");
}
`,
      }),
      repository: file({
        filename: `${kebab}.repository.ts`,
        directory: infra.artifacts.repositories,
        mode: "scaffold",
        content: `import type { ${shapePascal} } from "@core/${coreFeature}/models";
import type { ${portPascal}Port } from "@core/${coreFeature}/ports";

import { mapRawTo${shapePascal} } from "../mappers/${shapeKebab}.mapper";
import { ${loaderPascal}Loader } from "../loaders/${loaderKebab}.loader";

export type ${pascal}RepositoryDeps = {
  ${loaderCamel}Loader: ${loaderPascal}Loader;
};

export class ${pascal}Repository implements ${portPascal}Port {
  constructor(private readonly deps: ${pascal}RepositoryDeps) {}

  async get${shapePascal}ById(id: string): Promise<${shapePascal} | null> {
    const raw = await this.deps.${loaderCamel}Loader.get(id);
    return raw ? mapRawTo${shapePascal}(raw) : null;
  }
}
`,
      }),
    };
  }
);

export const UiPackage = A.defineConstruct("UiPackage", ({ name }) => {
  const pkg = toKebabCase(name);
  const packageDirectory = dir(`packages/ui-${pkg}`);
  return {
    packageDirectory,
    packageJson: file({
      filename: "package.json",
      directory: packageDirectory,
      mode: "scaffold",
      content: `${JSON.stringify(
        {
          name: `@ui/${pkg}`,
          private: true,
          type: "module",
          exports: { ".": "./index.ts" },
          peerDependencies: {
            react: "^19.0.0",
          },
        },
        null,
        2
      )}\n`,
    }),
    index: file({
      filename: "index.ts",
      directory: packageDirectory,
      mode: "scaffold",
      content: `/** Shared UI primitives for @ui/${pkg}. Importable from apps only. */
export {};
`,
    }),
    readme: file({
      filename: "README.md",
      directory: packageDirectory,
      mode: "scaffold",
      content: `# @ui/${pkg}

Shared UI package (apps only).
`,
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
      content: `${JSON.stringify(
        {
          name: app,
          private: true,
          type: "module",
          dependencies: {
            "@core/pagebuilder": "workspace:*",
            "@infrastructure/contentful": "workspace:*",
            "@ui/react": "workspace:*",
          },
        },
        null,
        2
      )}\n`,
    }),
  };
});

export const CompositionRoot = A.defineConstruct(
  "CompositionRoot",
  { app: App },
  ({ name, app }) => {
    const kebab = toKebabCase(name);
    const pascal = toPascalCase(name);
    const isServer = kebab.includes("server");
    const infraFn = isServer ? "getServerInfrastructure" : "getInfrastructure";
    const rootFn = `get${pascal}Root`;
    const serverImport = isServer
      ? `import "server-only";

`
      : "";
    return {
      source: file({
        filename: `${kebab}.composition.ts`,
        directory: app.artifacts.composition,
        mode: "scaffold",
        content: `${serverImport}type RequestContext = never;

function ${infraFn}(ctx: RequestContext) {
  void ctx;
  return {
    // pageRepository: new PageRepositoryRepository({ pageLoader: new PageLoader({}) }),
  };
}

/**
 * Returns use cases wired for one request context.
 */
export function ${rootFn}(ctx: RequestContext) {
  const infra = ${infraFn}(ctx);
  void infra;

  return {
    // resolvePage: createResolvePageUseCase(infra),
  };
}
`,
      }),
    };
  }
);

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
  InfrastructureRepository,
  UiPackage,
  App,
  CompositionRoot,
};
