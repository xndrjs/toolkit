import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import type {
  DataResolutionPort,
  ExpansionPort,
  ResourceKey,
} from "@xndrjs/resource-graph-resolver";

import { cmsAssetAri, cmsEntryAri } from "../cms/ari.js";
import type { CmsContentRegistry } from "../cms/content-registry.js";
import {
  CMS_ASSET_BATCH_SIZE,
  CMS_ENTRY_BATCH_SIZE,
  type CmsDataLoader,
} from "../cms/data-adapter.js";
import type { DemoContentRegistry } from "../content-registry.js";
import { integrationProductAri } from "../integration/ari.js";
import { INTEGRATION_BATCH_SIZE, type IntegrationDataLoader } from "../integration/data-adapter.js";

export type ResolveTrace = {
  beginRound(): void;
  logPull(label: string, resources: readonly ApplicationResourceIdentifier[], limit?: number): void;
  logLoad(label: string, requested: number, loaded: number): void;
  logExpand(
    resource: ApplicationResourceIdentifier,
    result: { resources: readonly ApplicationResourceIdentifier[]; isIsland?: boolean }
  ): void;
  logSummary(contentMapSize: number, errorCount: number): void;
};

export function createConsoleResolveTrace(): ResolveTrace {
  let round = 0;

  return {
    beginRound() {
      round += 1;
      console.log(`\n── Round ${round} ──`);
    },

    logPull(label, resources, limit) {
      if (resources.length === 0) {
        return;
      }
      const cap = limit === undefined ? "∞" : String(limit);
      const ids = resources.map((resource) => resource.format()).join(", ");
      console.log(`  PULL ${label} (cap ${cap}, took ${resources.length}): ${ids}`);
    },

    logLoad(label, requested, loaded) {
      if (requested === 0) {
        return;
      }
      console.log(`  LOAD ${label}: ${loaded}/${requested} resolved`);
    },

    logExpand(resource, result) {
      const children = result.resources.map((child) => child.format()).join(", ");
      const island = result.isIsland ? " [island]" : "";
      if (children.length === 0) {
        console.log(`  EXPAND ${resource.format()} → ∅${island}`);
        return;
      }
      console.log(`  EXPAND ${resource.format()} → ${children}${island}`);
    },

    logSummary(contentMapSize, errorCount) {
      console.log(`\nDone: ${contentMapSize} resources in ContentMap, ${errorCount} errors`);
    },
  };
}

export function withLoggingCmsLoader(loader: CmsDataLoader, trace: ResolveTrace): CmsDataLoader {
  return {
    loadEntries: (resources) => loader.loadEntries(resources),
    loadAssets: (resources) => loader.loadAssets(resources),

    async process(pull) {
      const entryBatch = pull.take(cmsEntryAri.matches, CMS_ENTRY_BATCH_SIZE);
      trace.logPull("cms.entries", entryBatch, CMS_ENTRY_BATCH_SIZE);

      const assetBatch = pull.take(cmsAssetAri.matches, CMS_ASSET_BATCH_SIZE);
      trace.logPull("cms.assets", assetBatch, CMS_ASSET_BATCH_SIZE);

      const [entryResult, assetResult] = await Promise.all([
        loader.loadEntries(entryBatch),
        loader.loadAssets(assetBatch),
      ]);

      trace.logLoad("cms.entries", entryBatch.length, entryResult.size);
      trace.logLoad("cms.assets", assetBatch.length, assetResult.size);

      return mergeCmsResults(entryResult, assetResult);
    },
  };
}

export function withLoggingIntegrationLoader(
  loader: IntegrationDataLoader,
  trace: ResolveTrace
): IntegrationDataLoader {
  return {
    load: (resources) => loader.load(resources),

    async process(pull) {
      const batch = pull.take(integrationProductAri.matches, INTEGRATION_BATCH_SIZE);
      trace.logPull("integration.products", batch, INTEGRATION_BATCH_SIZE);

      const result = await loader.load(batch);
      trace.logLoad("integration.products", batch.length, result.size);
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
      trace.beginRound();
      return gateway.process(pull);
    },
  };
}

export function withLoggingExpansionPort(
  port: ExpansionPort<DemoContentRegistry>,
  trace: ResolveTrace
): ExpansionPort<DemoContentRegistry> {
  return {
    expand(context) {
      const result = port.expand(context);
      trace.logExpand(context.resource, result);
      return result;
    },
  };
}

function mergeCmsResults(
  ...maps: ReadonlyMap<ResourceKey, CmsContentRegistry[keyof CmsContentRegistry]>[]
): ReadonlyMap<ResourceKey, CmsContentRegistry[keyof CmsContentRegistry]> {
  const merged = new Map<ResourceKey, CmsContentRegistry[keyof CmsContentRegistry]>();
  for (const map of maps) {
    for (const [key, value] of map) {
      merged.set(key, value);
    }
  }
  return merged;
}
