import {
  serializeAllIslands,
  type SchedulingMode,
  type ResolveResourceGraphOutput,
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
  cmsEntryAri,
  demoCmsStore,
  demoIds,
  type ContentfulLocaleCode,
} from "../infrastructure/cms/index.js";
import type { DemoContentRegistry } from "../infrastructure/content-registry.js";
import { createDefaultDemoExecutionContext } from "../infrastructure/demo-execution-context.js";
import { createDemoResolver } from "../infrastructure/demo-resolver.js";
import { demoProductCatalog } from "../infrastructure/integration/index.js";
import {
  createConsoleResolveTrace,
  type ResolveTrace,
} from "../infrastructure/logging/resolve-trace.js";
import { mapContentMapToPageAggregate } from "../infrastructure/mappers/content-map-to-page-aggregate.mapper.js";

/**
 * Demo walk scheduling mode. Defaults to lane (the production-shaped path).
 * Flip to `"barrier"` here when you want to compare schedulers by hand —
 * scheduler comparison lives in `@xndrjs/resource-graph-resolver-bench`.
 */
const DEMO_SCHEDULING_MODE: SchedulingMode = "lane";

export type ResolveDemoPageSuccess = {
  ok: true;
  page: Page;
  schedulingMode: SchedulingMode;
  resolvedCount: number;
  cacheReport: CacheHitReport;
  cacheSnapshot: IslandCacheSnapshot;
};

export type ResolveDemoPageFailure = {
  ok: false;
  schedulingMode: SchedulingMode;
  errors: readonly { resourceKey: string; message: string }[];
};

export type ResolveDemoPageResult = ResolveDemoPageSuccess | ResolveDemoPageFailure;

export type ResolveDemoPageOptions = {
  signal?: AbortSignal;
  /** Skip console tracing. Defaults to true under Vitest (`process.env.VITEST`). */
  quiet?: boolean;
  /** Simulated CMS fetch latency in ms. Overrides `DEMO_CMS_LATENCY_MS`. */
  cmsLatencyMs?: number;
  /** Simulated integration fetch latency in ms. Overrides `DEMO_INTEGRATION_LATENCY_MS`. */
  integrationLatencyMs?: number;
};

/**
 * Integration path for the demo page:
 * 1. root ARI + execution context
 * 2. warm `backingResources` from the island cache
 * 3. `createDemoResolver` (sources + expansion + scheduling mode)
 * 4. `resolve` → ContentMap / islands
 * 5. map to domain `Page`, persist islands
 */
export async function resolveDemoPage(
  locale: ContentfulLocaleCode,
  options?: ResolveDemoPageOptions
): Promise<ResolveDemoPageResult> {
  const quiet = isQuiet(options);
  const { cmsLatencyMs, integrationLatencyMs } = resolveLatencies(options);
  const executionContext = createDefaultDemoExecutionContext(locale);
  const pageRoot = cmsEntryAri({ id: demoIds.page, locale: executionContext.locale });
  const schedulingMode = DEMO_SCHEDULING_MODE;

  const trace = quiet ? undefined : createConsoleResolveTrace();
  const resolver = createDemoResolver({
    schedulingMode,
    cmsLatencyMs,
    integrationLatencyMs,
    observer: trace?.observer,
  });

  const { backingResources, report } = loadBackingForRoot(pageRoot, lruIslandCache);

  trace?.logLine(
    `Resolve demo — scheduling ${schedulingMode}, cache ${lruIslandCache.instanceId}, locale ${executionContext.locale}, latency cms=${cmsLatencyMs}ms integration=${integrationLatencyMs}ms`
  );

  const output = await resolver.resolve({
    root: pageRoot,
    executionContext,
    missingResourceMode: "throw",
    backingResources,
    signal: options?.signal,
  });

  return finalize({
    output,
    pageRoot,
    locale: executionContext.locale,
    schedulingMode,
    report,
    trace,
  });
}

function isQuiet(options?: ResolveDemoPageOptions): boolean {
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

function resolveLatencies(options?: ResolveDemoPageOptions): {
  cmsLatencyMs: number;
  integrationLatencyMs: number;
} {
  const quiet = isQuiet(options);
  return {
    cmsLatencyMs:
      options?.cmsLatencyMs ?? readEnvLatencyMs("DEMO_CMS_LATENCY_MS") ?? (quiet ? 0 : 80),
    integrationLatencyMs:
      options?.integrationLatencyMs ??
      readEnvLatencyMs("DEMO_INTEGRATION_LATENCY_MS") ??
      (quiet ? 0 : 350),
  };
}

function demoResolvedResourceCount(): number {
  return demoCmsStore.entries.size + demoCmsStore.assets.size + demoProductCatalog.size;
}

function finalize(args: {
  output: ResolveResourceGraphOutput<DemoContentRegistry>;
  pageRoot: ReturnType<typeof cmsEntryAri>;
  locale: ContentfulLocaleCode;
  schedulingMode: SchedulingMode;
  report: CacheHitReport;
  trace?: ResolveTrace;
}): ResolveDemoPageResult {
  const { output, pageRoot, locale, schedulingMode, report, trace } = args;

  const cacheReport: CacheHitReport = {
    ...report,
    promotedResourceCount: output.promotedResourceKeys.length,
  };

  if (trace) {
    const deps =
      cacheReport.islands.length === 0
        ? "none"
        : cacheReport.islands.map(({ islandId, status }) => `${islandId}:${status}`).join(", ");
    console.log(
      `Island cache — root ${cacheReport.rootIslandStatus}; manifest ${cacheReport.dependencyManifest}; deps [${deps}]; ` +
        `backing ${cacheReport.backingResourceCount}; promoted ${cacheReport.promotedResourceCount ?? 0}`
    );
    trace.logSummary(demoResolvedResourceCount(), output.errors.length);
  }

  if (output.errors.length > 0) {
    if (trace) {
      console.error(output.errors);
    }
    return {
      ok: false,
      schedulingMode,
      errors: output.errors.map(({ resourceKey, message }) => ({ resourceKey, message })),
    };
  }

  const page = mapContentMapToPageAggregate({
    result: output,
    root: pageRoot,
    locale,
  });

  persistResolvedIslands(serializeAllIslands(output), lruIslandCache, {
    rootIslandId: pageRoot.toString(),
    islandDependencies: output.islandDependencies,
  });

  return {
    ok: true,
    page,
    schedulingMode,
    resolvedCount: demoResolvedResourceCount(),
    cacheReport,
    cacheSnapshot: lruIslandCache.snapshot(),
  };
}
