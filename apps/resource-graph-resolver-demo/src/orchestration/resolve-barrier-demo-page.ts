import { ResolveContentGraphEngine } from "@xndrjs/resource-graph-resolver";

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
  type ResolveDemoPageOptions,
  type ResolveDemoPageResult,
} from "./resolve-demo-shared.js";

export type {
  ResolveDemoPageFailure,
  ResolveDemoPageOptions,
  ResolveDemoPageResult,
  ResolveDemoPageSuccess,
} from "./resolve-demo-shared.js";

/** Barrier walk: gateway + ResolveContentGraphEngine (round-based). */
export async function resolveBarrierDemoPage(
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

  const { backingResources, report } = loadBackingForRoot(pageRoot, lruIslandCache);
  const backingResourceCountBeforePromote = report.backingResourceCount;

  console.log(
    `Resolve demo — strategy barrier, cache ${lruIslandCache.instanceId}, root ${pageRoot.toString()}, locale ${executionContext.locale}`
  );

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
