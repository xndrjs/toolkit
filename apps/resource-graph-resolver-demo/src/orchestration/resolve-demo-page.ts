import {
  ResolveContentGraphEngine,
  serializeAllIslands,
  type ResolveContentGraphLimits,
} from "@xndrjs/resource-graph-resolver";

import type { Page } from "../domain/index.js";
import {
  loadBackingForRoot,
  lruIslandCache,
  persistResolvedIslands,
  type CacheHitReport,
  type IslandCacheSnapshot,
} from "../infrastructure/cache/index.js";
import {
  createCmsDataLoader,
  cmsEntryAri,
  demoCmsStore,
  demoIds,
  type ContentfulLocaleCode,
} from "../infrastructure/cms/index.js";
import type { DemoContentRegistry } from "../infrastructure/content-registry.js";
import {
  createDefaultDemoExecutionContext,
  type DemoExecutionContext,
} from "../infrastructure/demo-execution-context.js";
import { createDemoDataGateway } from "../infrastructure/demo-data-gateway.js";
import { createDemoExpansionPort } from "../infrastructure/expansion-policies.js";
import {
  createIntegrationDataLoader,
  demoProductCatalog,
} from "../infrastructure/integration/index.js";
import {
  createConsoleResolveTrace,
  withLoggingCmsLoader,
  withLoggingExpansionPort,
  withLoggingGateway,
  withLoggingIntegrationLoader,
} from "../infrastructure/logging/resolve-trace.js";
import { mapContentMapToPageAggregate } from "../infrastructure/mappers/content-map-to-page-aggregate.mapper.js";

export type ResolveDemoPageSuccess = {
  ok: true;
  page: Page;
  resolvedCount: number;
  cacheReport: CacheHitReport;
  cacheSnapshot: IslandCacheSnapshot;
};

export type ResolveDemoPageFailure = {
  ok: false;
  errors: readonly { resourceKey: string; message: string }[];
};

export type ResolveDemoPageResult = ResolveDemoPageSuccess | ResolveDemoPageFailure;

export type ResolveDemoPageOptions = {
  signal?: AbortSignal;
  limits?: ResolveContentGraphLimits;
};

function logCacheReport(report: CacheHitReport): void {
  const deps =
    report.islands.length === 0
      ? "none"
      : report.islands.map(({ islandId, status }) => `${islandId}:${status}`).join(", ");
  console.log(
    `Island cache — page ${report.pageIsland}; manifest ${report.dependencyManifest}; deps [${deps}]; ` +
      `backing ${report.backingResourceCount}; promoted ${report.promotedResourceCount ?? 0}`
  );
}

/** Runs the demo page-root resolution with console trace and domain aggregation. */
export async function resolveDemoPage(
  locale: ContentfulLocaleCode,
  options?: ResolveDemoPageOptions
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

  const { resolvedResourceCache, report } = loadBackingForRoot(pageRoot, lruIslandCache);

  console.log(`Resolve demo — root ${pageRoot.toString()}, locale ${executionContext.locale}`);

  const output = await engine.execute({
    root: pageRoot,
    executionContext,
    missingResourceMode: "throw",
    resolvedResourceCache,
    ...(options?.signal !== undefined ? { signal: options.signal } : {}),
    ...(options?.limits !== undefined ? { limits: options.limits } : {}),
  });

  const cacheReport: CacheHitReport = {
    ...report,
    promotedResourceCount: report.backingResourceCount - resolvedResourceCache.size,
  };
  logCacheReport(cacheReport);

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
  persistResolvedIslands(serializedIslands, lruIslandCache, {
    rootIslandId: pageRoot.toString(),
    islandDependencies: output.islandDependencies,
  });

  return {
    ok: true,
    page,
    resolvedCount,
    cacheReport,
    cacheSnapshot: lruIslandCache.snapshot(),
  };
}
