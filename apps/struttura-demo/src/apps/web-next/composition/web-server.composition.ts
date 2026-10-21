import "server-only";

type RequestContext = never;

function getServerInfrastructure(ctx: RequestContext) {
  void ctx;
  return {
    // pageRepository: new PageRepositoryRepository({ pageLoader: new PageLoader({}) }),
    // PageLoader from @infrastructure/contentful; PageRepositoryRepository from @adapter/contentful-pagebuilder.
  };
}

/**
 * Returns use cases wired for one request context.
 */
export function getWebServerRoot(ctx: RequestContext) {
  const infra = getServerInfrastructure(ctx);
  void infra;

  return {
    // resolvePage: createResolvePageUseCase(infra),
  };
}
