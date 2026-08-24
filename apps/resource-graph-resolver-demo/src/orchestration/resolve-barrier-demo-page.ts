import { BarrierResolveContentGraphEngine } from "@xndrjs/resource-graph-resolver";

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
import { createDemoDataGateway } from "../infrastructure/demo-data-gateway.js";
import { createDemoExpansionPort } from "../infrastructure/expansion-policies.js";
import { createIntegrationDataLoader } from "../infrastructure/integration/index.js";
import {
  createConsoleResolveTrace,
  withLoggingCmsLoader,
  withLoggingExpansionPort,
  withLoggingGateway,
  withLoggingIntegrationLoader,
} from "../infrastructure/logging/resolve-trace.js";
import {
  finalizeDemoResolve,
  isDemoResolveQuiet,
  type ResolveDemoPageOptions,
  type ResolveDemoPageResult,
} from "./resolve-demo-shared.js";

export type {
  ResolveDemoPageFailure,
  ResolveDemoPageOptions,
  ResolveDemoPageResult,
  ResolveDemoPageSuccess,
} from "./resolve-demo-shared.js";

/** Barrier walk: gateway + BarrierResolveContentGraphEngine (round-based). */
export async function resolveBarrierDemoPage(
  locale: ContentfulLocaleCode,
  options?: ResolveDemoPageOptions
): Promise<ResolveDemoPageResult> {
  const quiet = isDemoResolveQuiet(options);
  const executionContext = createDefaultDemoExecutionContext(locale);
  const pageRoot = cmsEntryAri({ id: demoIds.page, locale: executionContext.locale });

  const cmsLoader = createCmsDataLoader(demoCmsStore);
  const integrationLoader = createIntegrationDataLoader();
  const expansion = createDemoExpansionPort();

  const trace = quiet ? undefined : createConsoleResolveTrace();
  const cms = trace ? withLoggingCmsLoader(cmsLoader, trace) : cmsLoader;
  const integration = trace
    ? withLoggingIntegrationLoader(integrationLoader, trace)
    : integrationLoader;
  const gateway = trace
    ? withLoggingGateway(createDemoDataGateway(cms, integration), trace)
    : createDemoDataGateway(cms, integration);
  const expansionPort = trace ? withLoggingExpansionPort(expansion, trace) : expansion;

  const engine = new BarrierResolveContentGraphEngine<DemoContentRegistry, DemoExecutionContext>(
    gateway,
    expansionPort
  );

  const { backingResources, report } = loadBackingForRoot(pageRoot, lruIslandCache);
  const backingResourceCountBeforePromote = report.backingResourceCount;

  if (trace) {
    console.log(
      `Resolve demo — strategy barrier, cache ${lruIslandCache.instanceId}, root ${pageRoot.toString()}, locale ${executionContext.locale}`
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
