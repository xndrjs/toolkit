import { LaneResolveContentGraphEngine } from "@xndrjs/resource-graph-resolver";

import { loadBackingForRoot, lruIslandCache } from "../infrastructure/cache/index.js";
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
import { createDemoExpansionPort } from "../infrastructure/expansion-policies.js";
import { createIntegrationDataLoader } from "../infrastructure/integration/index.js";
import {
  createConsoleResolveTrace,
  withLoggingCmsLoader,
  withLoggingExpansionPort,
  withLoggingIntegrationLoader,
} from "../infrastructure/logging/resolve-trace.js";
import {
  finalizeDemoResolve,
  isDemoResolveQuiet,
  resolveDemoLoaderLatencies,
  type ResolveDemoPageOptions,
  type ResolveDemoPageResult,
} from "./resolve-demo-shared.js";

export type {
  ResolveDemoPageFailure,
  ResolveDemoPageOptions,
  ResolveDemoPageResult,
  ResolveDemoPageSuccess,
} from "./resolve-demo-shared.js";

/** Lane walk: source loaders + LaneResolveContentGraphEngine (serial-per-lane). */
export async function resolveLaneDemoPage(
  locale: ContentfulLocaleCode,
  options?: ResolveDemoPageOptions
): Promise<ResolveDemoPageResult> {
  const quiet = isDemoResolveQuiet(options);
  const { cmsLatencyMs, integrationLatencyMs } = resolveDemoLoaderLatencies(options);
  const executionContext = createDefaultDemoExecutionContext(locale);
  const pageRoot = cmsEntryAri({ id: demoIds.page, locale: executionContext.locale });

  const cmsLoader = createCmsDataLoader(demoCmsStore, { latencyMs: cmsLatencyMs });
  const integrationLoader = createIntegrationDataLoader(undefined, {
    latencyMs: integrationLatencyMs,
  });
  const expansion = createDemoExpansionPort();

  const trace = quiet ? undefined : createConsoleResolveTrace();
  const cms = trace ? withLoggingCmsLoader(cmsLoader, trace, "lane") : cmsLoader;
  const integration = trace
    ? withLoggingIntegrationLoader(integrationLoader, trace, "lane")
    : integrationLoader;
  const expansionPort = trace ? withLoggingExpansionPort(expansion, trace) : expansion;

  const engine = new LaneResolveContentGraphEngine<DemoContentRegistry, DemoExecutionContext>(
    [cms, integration],
    expansionPort
  );

  const { backingResources, report } = loadBackingForRoot(pageRoot, lruIslandCache);
  const backingResourceCountBeforePromote = report.backingResourceCount;

  if (trace) {
    console.log(
      `Resolve demo — strategy lane, cache ${lruIslandCache.instanceId}, root ${pageRoot.toString()}, locale ${executionContext.locale}, latency cms=${cmsLatencyMs}ms integration=${integrationLatencyMs}ms`
    );
  }

  const output = await engine.execute({
    root: pageRoot,
    executionContext,
    missingResourceMode: "throw",
    backingResources,
    signal: options?.signal,
  });

  return finalizeDemoResolve({
    output,
    pageRoot,
    locale: executionContext.locale,
    backingResourceCountBeforePromote,
    backingResourcesSize: backingResources.size,
    report,
    trace,
  });
}
