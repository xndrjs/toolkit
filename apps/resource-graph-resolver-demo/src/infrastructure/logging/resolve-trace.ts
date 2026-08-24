import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import type { DataResolutionPort, ExpansionPort } from "@xndrjs/resource-graph-resolver";

import { cmsAssetAri, cmsEntryAri } from "../cms/ari.js";
import {
  CMS_ASSET_BATCH_SIZE,
  CMS_ENTRY_BATCH_SIZE,
  type CmsDataLoader,
} from "../cms/data-adapter.js";
import type { DemoExecutionContext } from "../demo-execution-context.js";
import type { DemoContentRegistry } from "../content-registry.js";
import { integrationProductAri } from "../integration/ari.js";
import { INTEGRATION_BATCH_SIZE, type IntegrationDataLoader } from "../integration/data-adapter.js";

export type ResolveTrace = {
  /** Barrier engine: one log section per gateway round. */
  beginBarrierRound(): void;
  /** Lane engine: one log section per serial loader lane batch. */
  beginLaneBatch(label: string): void;
  logPull(label: string, resources: readonly ApplicationResourceIdentifier[], limit?: number): void;
  logLoad(label: string, requested: number, loaded: number): void;
  logExpand(
    resource: ApplicationResourceIdentifier,
    result: { resources: readonly ApplicationResourceIdentifier[]; isIsland?: boolean }
  ): void;
  logSummary(contentMapSize: number, errorCount: number): void;
};

export type LoaderTraceMode = "barrier" | "lane";

export function createConsoleResolveTrace(): ResolveTrace {
  let barrierRound = 0;
  let laneBatch = 0;

  return {
    beginBarrierRound() {
      barrierRound += 1;
      console.log(`\n── Barrier round ${barrierRound} ──`);
    },

    beginLaneBatch(label) {
      laneBatch += 1;
      console.log(`\n── Lane batch ${laneBatch} (${label}) ──`);
    },

    logPull(label, resources, limit) {
      if (resources.length === 0) {
        return;
      }
      const cap = limit === undefined ? "∞" : String(limit);
      const ids = resources.map((resource) => resource.toString()).join(", ");
      console.log(`  PULL ${label} (cap ${cap}, took ${resources.length}): ${ids}`);
    },

    logLoad(label, requested, loaded) {
      if (requested === 0) {
        return;
      }
      console.log(`  LOAD ${label}: ${loaded}/${requested} resolved`);
    },

    logExpand(resource, result) {
      const children = result.resources.map((child) => child.toString()).join(", ");
      const island = result.isIsland ? " [island]" : "";
      if (children.length === 0) {
        console.log(`  EXPAND ${resource.toString()} → ∅${island}`);
        return;
      }
      console.log(`  EXPAND ${resource.toString()} → ${children}${island}`);
    },

    logSummary(contentMapSize, errorCount) {
      console.log(`\nDone: ${contentMapSize} resources in ContentMap, ${errorCount} errors`);
    },
  };
}

export function withLoggingCmsLoader(
  loader: CmsDataLoader,
  trace: ResolveTrace,
  mode: LoaderTraceMode = "barrier"
): CmsDataLoader {
  return {
    accepts: (resource) => loader.accepts(resource),
    loadEntries: (resources) => loader.loadEntries(resources),
    loadAssets: (resources) => loader.loadAssets(resources),

    async process(pull) {
      if (mode === "lane") {
        trace.beginLaneBatch("cms");
      }

      const entryBatch = pull.take(cmsEntryAri.matches, CMS_ENTRY_BATCH_SIZE);
      trace.logPull("cms.entries", entryBatch, CMS_ENTRY_BATCH_SIZE);

      const assetBatch = pull.take(cmsAssetAri.matches, CMS_ASSET_BATCH_SIZE);
      trace.logPull("cms.assets", assetBatch, CMS_ASSET_BATCH_SIZE);

      if (entryBatch.length === 0 && assetBatch.length === 0) {
        return [];
      }

      const [entryResult, assetResult] = await Promise.all([
        entryBatch.length === 0 ? Promise.resolve([]) : loader.loadEntries(entryBatch),
        assetBatch.length === 0 ? Promise.resolve([]) : loader.loadAssets(assetBatch),
      ]);

      trace.logLoad("cms.entries", entryBatch.length, entryResult.length);
      trace.logLoad("cms.assets", assetBatch.length, assetResult.length);

      return [...entryResult, ...assetResult];
    },
  };
}

export function withLoggingIntegrationLoader(
  loader: IntegrationDataLoader,
  trace: ResolveTrace,
  mode: LoaderTraceMode = "barrier"
): IntegrationDataLoader {
  return {
    accepts: (resource) => loader.accepts(resource),
    load: (resources) => loader.load(resources),

    async process(pull) {
      if (mode === "lane") {
        trace.beginLaneBatch("integration");
      }

      const batch = pull.take(integrationProductAri.matches, INTEGRATION_BATCH_SIZE);
      trace.logPull("integration.products", batch, INTEGRATION_BATCH_SIZE);

      if (batch.length === 0) {
        return [];
      }

      const result = await loader.load(batch);
      trace.logLoad("integration.products", batch.length, result.length);
      return result;
    },
  };
}

export function withLoggingGateway(
  gateway: DataResolutionPort<DemoContentRegistry>,
  trace: ResolveTrace
): DataResolutionPort<DemoContentRegistry> {
  return {
    async process(pull) {
      trace.beginBarrierRound();
      return gateway.process(pull);
    },
  };
}

export function withLoggingExpansionPort(
  port: ExpansionPort<DemoContentRegistry, DemoExecutionContext>,
  trace: ResolveTrace
): ExpansionPort<DemoContentRegistry, DemoExecutionContext> {
  return {
    expand(context) {
      const result = port.expand(context);
      trace.logExpand(context.resource, result);
      return result;
    },
  };
}
