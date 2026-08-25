import { loadBackingForRoot, lruIslandCache } from "../infrastructure/cache/index.js";
import { cmsEntryAri, demoIds, type ContentfulLocaleCode } from "../infrastructure/cms/index.js";
import { createDefaultDemoExecutionContext } from "../infrastructure/demo-execution-context.js";
import { createDemoResolver } from "../infrastructure/demo-resolver.js";
import { createConsoleResolveTrace } from "../infrastructure/logging/resolve-trace.js";
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

/** Barrier walk: every source in a round completes before the next expansion. */
export async function resolveBarrierDemoPage(
  locale: ContentfulLocaleCode,
  options?: ResolveDemoPageOptions
): Promise<ResolveDemoPageResult> {
  const quiet = isDemoResolveQuiet(options);
  const { cmsLatencyMs, integrationLatencyMs } = resolveDemoLoaderLatencies(options);
  const executionContext = createDefaultDemoExecutionContext(locale);
  const pageRoot = cmsEntryAri({ id: demoIds.page, locale: executionContext.locale });

  const trace = quiet ? undefined : createConsoleResolveTrace();

  const resolver = createDemoResolver({
    strategy: "barrier",
    cmsLatencyMs,
    integrationLatencyMs,
    ...(trace ? { observer: trace.observer } : {}),
  });

  const { backingResources, report } = loadBackingForRoot(pageRoot, lruIslandCache);

  trace?.logLine(
    `Resolve demo — strategy barrier, cache ${lruIslandCache.instanceId}, locale ${executionContext.locale}, latency cms=${cmsLatencyMs}ms integration=${integrationLatencyMs}ms`
  );

  const output = await resolver.resolve({
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
    report,
    trace,
  });
}
