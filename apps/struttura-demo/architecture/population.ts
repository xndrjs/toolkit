import { createPopulateApi } from "./populate-api.generated";

/**
 * Vertical slice mirroring xndrjs-monorepo structural elements for pagebuilder.
 * ESLint tooling under project is unmanaged (hand-authored).
 *
 * Explicit `id`s keep effective identities unique when names would collide
 * across constructs (e.g. Shape `page` vs Capabilities `page`).
 */
const api = createPopulateApi();

function createCore(name: string) {
  const core = api.CorePackage({ name });
  return {
    core,
    models: api.ModelsModule({ id: `${name}-models`, name: "models", core }),
    operations: api.OperationsModule({
      id: `${name}-operations`,
      name: "operations",
      core,
    }),
    useCases: api.UseCasesModule({ id: `${name}-useCases`, name: "useCases", core }),
    ports: api.PortsModule({ id: `${name}-ports`, name: "ports", core }),
    errors: api.ErrorsModule({ id: `${name}-errors`, name: "errors", core }),
  };
}

api.WorkspaceRoot({ name: "workspace" });

api.FeatureSpec({ id: "spec-pagebuilder", name: "pagebuilder" });

const pagebuilder = createCore("pagebuilder");

const page = api.Shape({ name: "page", models: pagebuilder.models });
api.Primitive({ name: "pageSlug", models: pagebuilder.models });
api.Proof({ name: "publishedPage", models: pagebuilder.models });

api.Capabilities({
  id: "page-capabilities",
  name: "page",
  operations: pagebuilder.operations,
});
api.DomainService({ name: "pagePricing", operations: pagebuilder.operations });
api.DomainError({ name: "pageNotFound", errors: pagebuilder.errors });

const pageRepositoryPort = api.Port({ name: "pageRepository", ports: pagebuilder.ports });
api.UseCase({ name: "resolvePage", useCases: pagebuilder.useCases });

const contentful = api.InfrastructurePackage({ name: "contentful" });
const pageLoader = api.InfrastructureLoader({
  id: "page-loader",
  name: "page",
  infra: contentful,
});
const contentfulPagebuilder = api.AdapterPackage({
  name: "contentful-pagebuilder",
  infra: contentful,
  core: pagebuilder.core,
});
api.Adapter({
  id: "page-repository",
  name: "pageRepository",
  adapter: contentfulPagebuilder,
  port: pageRepositoryPort,
  loader: pageLoader,
  shape: page,
  core: pagebuilder.core,
  infra: contentful,
});

api.UiPackage({ name: "react" });

const webNext = api.App({ name: "web-next" });
api.CompositionRoot({ name: "web-server", app: webNext });

export const population = api.population;
