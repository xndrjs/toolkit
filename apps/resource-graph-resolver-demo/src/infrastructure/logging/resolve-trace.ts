import type { ResolutionObserver } from "@xndrjs/resource-graph-resolver";

export type ResolveTrace = {
  readonly observer: ResolutionObserver;
  logLine(message: string): void;
  logSummary(contentMapSize: number, errorCount: number): void;
};

function formatInFlight(inFlight: ReadonlySet<string>): string {
  if (inFlight.size === 0) {
    return "—";
  }

  return [...inFlight].join(", ");
}

/**
 * Console tracer built on the resolver's observer hooks.
 *
 * Sources and expansion policies stay undecorated: everything below is derived
 * from events the resolver already emits.
 */
export function createConsoleResolveTrace(): ResolveTrace {
  const startedAt = Date.now();
  const inFlight = new Set<string>();
  let batchCount = 0;

  function stamp(): string {
    const elapsed = Date.now() - startedAt;
    return `T+${String(elapsed).padStart(4, " ")}ms`;
  }

  function log(message: string): void {
    console.log(`[${stamp()}] ${message}`);
  }

  const observer: ResolutionObserver = {
    onResolutionStart({ root, strategy, sourceIds }) {
      log(`── Resolve ${root.toString()} · strategy ${strategy} · sources ${sourceIds.join(", ")}`);
    },

    onBatchStart({ sourceId, batchNumber, resourcesByFamily, resourceCount }) {
      batchCount += 1;
      const label = `${sourceId}#${batchNumber}`;
      inFlight.add(label);

      console.log(
        `\n[${stamp()}] ▶ Batch ${batchCount} (${label}, ${resourceCount} resources) · in-flight: ${formatInFlight(inFlight)}`
      );

      for (const [family, resources] of Object.entries(resourcesByFamily)) {
        if (resources.length === 0) {
          continue;
        }
        log(`  REQUEST ${sourceId}.${family} (${resources.length})`);
        for (const resource of resources) {
          log(`    · ${resource.toString()}`);
        }
      }
    },

    onBatchEnd({ sourceId, batchNumber, requestedCount, resolvedCount, durationMs }) {
      const label = `${sourceId}#${batchNumber}`;
      inFlight.delete(label);
      log(
        `◀ Batch done (${label}, ${durationMs}ms): ${resolvedCount}/${requestedCount} resolved · in-flight: ${formatInFlight(inFlight)}`
      );
    },

    onBatchError({ sourceId, batchNumber, durationMs, error }) {
      const label = `${sourceId}#${batchNumber}`;
      inFlight.delete(label);
      log(`◀ Batch FAILED (${label}, ${durationMs}ms): ${String(error)}`);
    },

    onExpand({ resource, islandId, isIsland, children }) {
      // A resource reachable from several islands expands once per island, so the
      // island is what distinguishes otherwise identical lines.
      const island = isIsland ? " [opens island]" : ` [in ${islandId}]`;
      if (children.length === 0) {
        log(`    EXPAND ${resource.toString()} → ∅${island}`);
        return;
      }

      log(`    EXPAND ${resource.toString()} →${island}`);
      for (const child of children) {
        log(`      · ${child.toString()}`);
      }
    },

    onBackingPromote({ resource, islandIds }) {
      log(`    PROMOTE ${resource.toString()} from cache · islands ${islandIds.join(", ")}`);
    },

    onMissingResource({ resourceKey, message }) {
      log(`    MISSING ${resourceKey}: ${message}`);
    },
  };

  return {
    observer,

    logLine(message) {
      log(message);
    },

    logSummary(contentMapSize, errorCount) {
      console.log(
        `\n[${stamp()}] Done: ${contentMapSize} resources in ContentMap, ${errorCount} errors, ${batchCount} batches`
      );
    },
  };
}
