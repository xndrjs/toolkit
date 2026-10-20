import { createPopulateApi } from "./populate-api.generated";

/**
 * Vertical slice mirroring xndrjs-monorepo structural elements for pagebuilder.
 * ESLint tooling under project is unmanaged (hand-authored).
 *
 * Explicit `id`s keep effective identities unique when names would collide
 * across constructs (e.g. Shape `page` vs Capabilities `page`).
 */
const api = createPopulateApi();

api.WorkspaceRoot({ name: "workspace" });

api.FeatureSpec({ id: "spec-pagebuilder", name: "pagebuilder" });

const pagebuilder = api.CorePackage({ name: "pagebuilder" });
const models = api.ModelsModule({ name: "models", core: pagebuilder });
const operations = api.OperationsModule({ name: "operations", core: pagebuilder });
const useCases = api.UseCasesModule({ name: "useCases", core: pagebuilder });
const ports = api.PortsModule({ name: "ports", core: pagebuilder });
const errors = api.ErrorsModule({ name: "errors", core: pagebuilder });

const page = api.Shape({ name: "page", models });
api.Primitive({ name: "pageSlug", models });
api.Proof({ name: "publishedPage", models });

api.Capabilities({ id: "page-capabilities", name: "page", operations });
api.DomainService({ name: "pagePricing", operations });
api.DomainError({ name: "pageNotFound", errors });

const pageRepositoryPort = api.Port({ name: "pageRepository", ports });
api.UseCase({ name: "resolvePage", useCases });

const contentful = api.InfrastructurePackage({ name: "contentful" });
const pageLoader = api.InfrastructureLoader({
  id: "page-loader",
  name: "page",
  infra: contentful,
});
api.InfrastructureRepository({
  id: "page-repository",
  name: "pageRepository",
  infra: contentful,
  port: pageRepositoryPort,
  loader: pageLoader,
  shape: page,
});

api.UiPackage({ name: "react" });

const webNext = api.App({ name: "web-next" });
api.CompositionRoot({ name: "web-server", app: webNext });

export const population = api.population;
