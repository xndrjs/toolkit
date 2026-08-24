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
  /** Lane engine: mark the current loader batch as settled. */
  endLaneBatch(label: string): void;
  logPull(label: string, resources: readonly ApplicationResourceIdentifier[], limit?: number): void;
  logLoad(label: string, requested: number, loaded: number): void;
  logExpand(
    resource: ApplicationResourceIdentifier,
    result: { resources: readonly ApplicationResourceIdentifier[]; isIsland?: boolean }
  ): void;
  logSummary(contentMapSize: number, errorCount: number): void;
};

export type LoaderTraceMode = "barrier" | "lane";

function formatInFlight(inFlight: ReadonlySet<string>): string {
  if (inFlight.size === 0) {
    return "—";
  }
  return [...inFlight].join(", ");
}

export function createConsoleResolveTrace(): ResolveTrace {
  let barrierRound = 0;
  let laneBatch = 0;
  const startedAt = Date.now();
  const inFlight = new Set<string>();
  const batchStartedAt = new Map<string, number>();

  function stamp(): string {
    const elapsed = Date.now() - startedAt;
    return `T+${String(elapsed).padStart(4, " ")}ms`;
  }

  return {
    beginBarrierRound() {
      barrierRound += 1;
      console.log(`\n[${stamp()}] ── Barrier round ${barrierRound} ──`);
    },

    beginLaneBatch(label) {
      laneBatch += 1;
      inFlight.add(label);
      batchStartedAt.set(label, Date.now());
      console.log(
        `\n[${stamp()}] ▶ Lane batch ${laneBatch} (${label}) · in-flight: ${formatInFlight(inFlight)}`
      );
    },

    endLaneBatch(label) {
      const started = batchStartedAt.get(label);
      const duration = started === undefined ? "?" : `${Date.now() - started}ms`;
      batchStartedAt.delete(label);
      inFlight.delete(label);
      console.log(
        `[${stamp()}] ◀ Lane batch done (${label}, ${duration}) · in-flight: ${formatInFlight(inFlight)}`
      );
    },

    logPull(label, resources, limit) {
      if (resources.length === 0) {
        return;
      }
      const cap = limit === undefined ? "∞" : String(limit);
      const ids = resources.map((resource) => resource.toString()).join(", ");
      console.log(`[${stamp()}]   PULL ${label} (cap ${cap}, took ${resources.length}): ${ids}`);
    },

    logLoad(label, requested, loaded) {
      if (requested === 0) {
        return;
      }
      console.log(`[${stamp()}]   LOAD ${label}: ${loaded}/${requested} resolved`);
    },

    logExpand(resource, result) {
      const island = result.isIsland ? " [island]" : "";
      if (result.resources.length === 0) {
        console.log(`[${stamp()}]     EXPAND ${resource.toString()} → ∅${island}`);
        return;
      }
      console.log(`[${stamp()}]     EXPAND ${resource.toString()} →${island}`);
      for (const child of result.resources) {
        console.log(`[${stamp()}]       · ${child.toString()}`);
      }
    },

    logSummary(contentMapSize, errorCount) {
      console.log(
        `\n[${stamp()}] Done: ${contentMapSize} resources in ContentMap, ${errorCount} errors`
      );
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

      try {
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
      } finally {
        if (mode === "lane") {
          trace.endLaneBatch("cms");
        }
      }
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

      try {
        const batch = pull.take(integrationProductAri.matches, INTEGRATION_BATCH_SIZE);
        trace.logPull("integration.products", batch, INTEGRATION_BATCH_SIZE);

        if (batch.length === 0) {
          return [];
        }

        const result = await loader.load(batch);
        trace.logLoad("integration.products", batch.length, result.length);
        return result;
      } finally {
        if (mode === "lane") {
          trace.endLaneBatch("integration");
        }
      }
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
