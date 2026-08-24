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
  /**
   * Skip logging decorators and console output.
   * Defaults to true under Vitest (`process.env.VITEST`).
   */
  quiet?: boolean;
  /**
   * Simulated CMS fetch latency in ms.
   * Overrides `DEMO_CMS_LATENCY_MS`. Defaults to 0 when quiet, else 80.
   */
  cmsLatencyMs?: number;
  /**
   * Simulated integration fetch latency in ms.
   * Overrides `DEMO_INTEGRATION_LATENCY_MS`. Defaults to 0 when quiet, else 350.
   */
  integrationLatencyMs?: number;
};

/** When true, resolve uses undecorated ports (no console trace wrappers). */
export function isDemoResolveQuiet(options?: ResolveDemoPageOptions): boolean {
  return options?.quiet ?? process.env.VITEST !== undefined;
}

function readEnvLatencyMs(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Resolve simulated network latencies for CMS / integration loaders. */
export function resolveDemoLoaderLatencies(options?: ResolveDemoPageOptions): {
  cmsLatencyMs: number;
  integrationLatencyMs: number;
} {
  const quiet = isDemoResolveQuiet(options);
  const demoCmsDefault = quiet ? 0 : 80;
  const demoIntegrationDefault = quiet ? 0 : 350;

  return {
    cmsLatencyMs:
      options?.cmsLatencyMs ?? readEnvLatencyMs("DEMO_CMS_LATENCY_MS") ?? demoCmsDefault,
    integrationLatencyMs:
      options?.integrationLatencyMs ??
      readEnvLatencyMs("DEMO_INTEGRATION_LATENCY_MS") ??
      demoIntegrationDefault,
  };
}

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
  /** Present only when logging decorators are enabled. */
  trace?: ResolveTrace;
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

  if (trace) {
    logCacheReport(cacheReport);
    trace.logSummary(demoResolvedResourceCount(), output.errors.length);
  }

  if (output.errors.length > 0) {
    if (trace) {
      console.error(output.errors);
    }
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
    resolvedCount: demoResolvedResourceCount(),
    cacheReport,
    cacheSnapshot: lruIslandCache.snapshot(),
  };
}
