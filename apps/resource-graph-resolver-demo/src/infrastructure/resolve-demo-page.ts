import {
  ResolveContentGraphEngine,
  serializeAllIslands,
  type SerializedIsland,
} from "@xndrjs/resource-graph-resolver";

import { mapContentMapToPageAggregate } from "./mappers/content-map-to-page-aggregate.mapper.js";
import {
  createCmsDataLoader,
  cmsEntryAri,
  demoCmsStore,
  demoIds,
  type ContentfulLocaleCode,
} from "./cms/index.js";
import {
  createDefaultDemoExecutionContext,
  type DemoExecutionContext,
} from "./demo-execution-context.js";
import { createDemoDataGateway } from "./demo-data-gateway.js";
import { createDemoExpansionPort } from "./expansion-policies.js";
import type { DemoContentRegistry } from "./content-registry.js";
import { createIntegrationDataLoader, demoProductCatalog } from "./integration/index.js";
import {
  createConsoleResolveTrace,
  withLoggingCmsLoader,
  withLoggingExpansionPort,
  withLoggingGateway,
  withLoggingIntegrationLoader,
} from "./logging/resolve-trace.js";
import type { Page } from "../domain/index.js";

export type ResolveDemoPageSuccess = {
  ok: true;
  page: Page;
  serializedIslands: SerializedIsland[];
  resolvedCount: number;
};

export type ResolveDemoPageFailure = {
  ok: false;
  errors: readonly { resourceKey: string; message: string }[];
};

export type ResolveDemoPageResult = ResolveDemoPageSuccess | ResolveDemoPageFailure;

/** Runs the demo page-root resolution with console trace and domain aggregation. */
export async function resolveDemoPage(
  locale: ContentfulLocaleCode
): Promise<ResolveDemoPageResult> {
  const trace = createConsoleResolveTrace();
  const executionContext = createDefaultDemoExecutionContext(locale);
  const pageRoot = cmsEntryAri({ id: demoIds.page, locale: executionContext.locale });

  const cms = withLoggingCmsLoader(createCmsDataLoader(demoCmsStore), trace);
  const integration = withLoggingIntegrationLoader(createIntegrationDataLoader(), trace);
  const gateway = withLoggingGateway(createDemoDataGateway(cms, integration), trace);
  const expansionPort = withLoggingExpansionPort(createDemoExpansionPort(), trace);
  const engine = new ResolveContentGraphEngine<DemoContentRegistry, DemoExecutionContext>(
    gateway,
    expansionPort
  );

  console.log(`Resolve demo — root ${pageRoot.format()}, locale ${executionContext.locale}`);

  const output = await engine.execute({
    root: pageRoot,
    executionContext,
    missingResourceMode: "throw",
  });

  const resolvedCount =
    demoCmsStore.entries.size + demoCmsStore.assets.size + demoProductCatalog.size;

  trace.logSummary(resolvedCount, output.errors.length);

  if (output.errors.length > 0) {
    console.error(output.errors);
    return {
      ok: false,
      errors: output.errors.map(({ resourceKey, message }) => ({ resourceKey, message })),
    };
  }

  const page = mapContentMapToPageAggregate({
    result: output,
    root: pageRoot,
    locale: executionContext.locale,
  });
  const serializedIslands = serializeAllIslands(output);

  return {
    ok: true,
    page,
    serializedIslands,
    resolvedCount,
  };
}
