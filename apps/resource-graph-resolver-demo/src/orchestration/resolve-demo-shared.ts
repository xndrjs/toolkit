import {
  serializeAllIslands,
  type ResolveContentGraphOutput,
} from "@xndrjs/resource-graph-resolver";

import type { Page } from "../domain/index.js";
import {
  lruIslandCache,
  persistResolvedIslands,
  type CacheHitReport,
  type IslandCacheSnapshot,
} from "../infrastructure/cache/index.js";
import {
  cmsEntryAri,
  demoCmsStore,
  type ContentfulLocaleCode,
} from "../infrastructure/cms/index.js";
import type { DemoContentRegistry } from "../infrastructure/content-registry.js";
import { demoProductCatalog } from "../infrastructure/integration/index.js";
import type { ResolveTrace } from "../infrastructure/logging/resolve-trace.js";
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
};

export function logCacheReport(report: CacheHitReport): void {
  const deps =
    report.islands.length === 0
      ? "none"
      : report.islands.map(({ islandId, status }) => `${islandId}:${status}`).join(", ");
  console.log(
    `Island cache — root ${report.rootIslandStatus}; manifest ${report.dependencyManifest}; deps [${deps}]; ` +
      `backing ${report.backingResourceCount}; promoted ${report.promotedResourceCount ?? 0}`
  );
}

export function demoResolvedResourceCount(): number {
  return demoCmsStore.entries.size + demoCmsStore.assets.size + demoProductCatalog.size;
}

/** Shared post-execute: cache report, aggregate, persist islands. */
export function finalizeDemoResolve(args: {
  output: ResolveContentGraphOutput<DemoContentRegistry>;
  pageRoot: ReturnType<typeof cmsEntryAri>;
  locale: ContentfulLocaleCode;
  backingResourceCountBeforePromote: number;
  backingResourcesSize: number;
  report: CacheHitReport;
  trace: ResolveTrace;
}): ResolveDemoPageResult {
  const {
    output,
    pageRoot,
    locale,
    backingResourceCountBeforePromote,
    backingResourcesSize,
    report,
    trace,
  } = args;

  const cacheReport: CacheHitReport = {
    ...report,
    promotedResourceCount: backingResourceCountBeforePromote - backingResourcesSize,
  };
  logCacheReport(cacheReport);

  const resolvedCount = demoResolvedResourceCount();
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
    locale,
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
