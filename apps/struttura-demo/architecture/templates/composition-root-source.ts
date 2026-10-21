import { toKebabCase, toPascalCase } from "@xndrjs/struttura";

export function compositionRootSource(name: string): string {
  const kebab = toKebabCase(name);
  const pascal = toPascalCase(name);
  const isServer = kebab.includes("server");
  const infraFn = isServer ? "getServerInfrastructure" : "getInfrastructure";
  const rootFn = `get${pascal}Root`;
  const serverImport = isServer
    ? `import "server-only";

`
    : "";
  return `${serverImport}type RequestContext = never;

function ${infraFn}(ctx: RequestContext) {
  void ctx;
  return {
    // pageRepository: new PageRepositoryRepository({ pageLoader: new PageLoader({}) }),
    // PageLoader from @infrastructure/contentful; PageRepositoryRepository from @adapter/contentful-pagebuilder.
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
`;
}
