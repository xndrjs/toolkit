import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import { describe, expect, it } from "vitest";

import { createResourceGraphResolver } from "./resource-graph-resolver";
import { createExpansionPolicyChain, type ExpansionPolicy } from "../ports/expansion-port";
import type { ResolutionObserver } from "../observability/resolution-observer";
import type { ResourceSource } from "../ports/resource-source";
import { createDeferred, createStoreSource } from "../testing/resolver-test-helpers";
import { idOf, testAriFactory } from "../testing/test-fixtures";
import type { ResolutionStrategy } from "../types";

const chainAri = testAriFactory("chain");
const slowAri = testAriFactory("slow");
const itemAri = testAriFactory("item");

/** Lets every pending macrotask run so any load that *can* start has started. */
async function flushMacrotasks(rounds = 12): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

describe("lane versus barrier scheduling", () => {
  /**
   * `chain` is a four-deep sequential dependency owned by a fast source; `slow`
   * is a single resource discovered in the first expansion and held pending.
   */
  function createChainGraph() {
    const root = chainAri({ id: "P" });
    const second = chainAri({ id: "A" });
    const third = chainAri({ id: "B" });
    const fourth = chainAri({ id: "C" });
    const slow = slowAri({ id: "S" });

    const store = new Map<string, unknown>([
      [root.toString(), {}],
      [second.toString(), {}],
      [third.toString(), {}],
      [fourth.toString(), {}],
      [slow.toString(), {}],
    ]);

    const policies: ExpansionPolicy[] = [
      {
        matches: ({ resource }) => resource.equals(root),
        expand: () => ({ resources: [second, slow] }),
      },
      {
        matches: ({ resource }) => resource.equals(second),
        expand: () => ({ resources: [third] }),
      },
      {
        matches: ({ resource }) => resource.equals(third),
        expand: () => ({ resources: [fourth] }),
      },
    ];

    return { root, store, policies };
  }

  async function countFastBatchesWhileSlowIsPending(
    strategy: ResolutionStrategy
  ): Promise<{ beforeGate: number; total: number }> {
    const { root, store, policies } = createChainGraph();
    const gate = createDeferred<void>();

    const fast = createStoreSource({ id: "fast", families: { chain: chainAri }, store });
    const slow = createStoreSource({
      id: "slow",
      families: { slow: slowAri },
      store,
      gate: () => gate.promise,
    });

    const resolver = createResourceGraphResolver({
      sources: [fast, slow],
      expansion: createExpansionPolicyChain(policies),
      strategy,
    });

    const resolution = resolver.resolve({
      root,
      executionContext: {},
      missingResourceMode: "throw",
    });

    await flushMacrotasks();
    const beforeGate = fast.batches.length;

    gate.resolve();
    await resolution;

    return { beforeGate, total: fast.batches.length };
  }

  it("lets a fast source walk the whole chain while a slow source is still pending", async () => {
    const { beforeGate, total } = await countFastBatchesWhileSlowIsPending("lane");

    expect(beforeGate).toBe(4);
    expect(total).toBe(4);
  });

  it("holds the fast source at the round boundary until every source in the round completes", async () => {
    const { beforeGate, total } = await countFastBatchesWhileSlowIsPending("barrier");

    expect(beforeGate).toBe(2);
    expect(total).toBe(4);
  });
});

describe("batching and concurrency", () => {
  const root = itemAri({ id: "root" });
  const children = Array.from({ length: 10 }, (_, index) => itemAri({ id: `c${index}` }));

  const store = new Map<string, unknown>([
    [root.toString(), {}],
    ...children.map((child) => [child.toString(), {}] as const),
  ]);

  const policies: ExpansionPolicy[] = [
    {
      matches: ({ resource }) => resource.equals(root),
      expand: () => ({ resources: children }),
    },
  ];

  async function resolveItems(options: { batchSize?: number; concurrency?: number }) {
    const source = createStoreSource({
      id: "items",
      families: { item: itemAri },
      store,
      ...(options.batchSize !== undefined ? { batchSize: { item: options.batchSize } } : {}),
      ...(options.concurrency !== undefined ? { concurrency: options.concurrency } : {}),
      delayMs: 1,
    });

    const resolver = createResourceGraphResolver({
      sources: [source],
      expansion: createExpansionPolicyChain(policies),
      strategy: "lane",
    });

    const output = await resolver.resolve({
      root,
      executionContext: {},
      missingResourceMode: "throw",
    });

    return { source, output };
  }

  it("chunks a wide frontier into serial batches capped by batchSize", async () => {
    const { source, output } = await resolveItems({ batchSize: 3 });

    expect(output.contentMap.size).toBe(11);
    // [root], then the ten children as 3 + 3 + 3 + 1.
    expect(source.batches.map((batch) => batch.length)).toEqual([1, 3, 3, 3, 1]);
    expect(source.inFlightPeak.value).toBe(1);
  });

  it("takes the whole frontier in one load when no batchSize is declared", async () => {
    const { source, output } = await resolveItems({});

    expect(output.contentMap.size).toBe(11);
    expect(source.batches.map((batch) => batch.length)).toEqual([1, 10]);
  });

  it("runs batches in parallel up to the declared concurrency", async () => {
    const { source, output } = await resolveItems({ batchSize: 3, concurrency: 3 });

    expect(output.contentMap.size).toBe(11);
    expect(source.inFlightPeak.value).toBe(3);
  });
});

describe("observer", () => {
  it("reports the resolution lifecycle, batches, expansions and promotions", async () => {
    const root = chainAri({ id: "P" });
    const child = chainAri({ id: "A" });
    const promoted = slowAri({ id: "S" });

    const store = new Map<string, unknown>([
      [root.toString(), {}],
      [child.toString(), {}],
    ]);

    const events: string[] = [];
    const batchStarts: { sourceId: string; families: string[] }[] = [];
    const observer: ResolutionObserver = {
      onResolutionStart: (event) => {
        events.push(`start:${event.strategy}:${event.sourceIds.join("+")}`);
      },
      onBatchStart: (event) => {
        events.push(`batchStart:${event.sourceId}#${event.batchNumber}:${event.resourceCount}`);
        batchStarts.push({
          sourceId: event.sourceId,
          families: Object.keys(event.resourcesByFamily),
        });
      },
      onBatchEnd: (event) => {
        events.push(`batchEnd:${event.sourceId}#${event.batchNumber}:${event.resolvedCount}`);
      },
      onExpand: (event) => {
        events.push(`expand:${idOf(event.resource)}:island=${String(event.isIsland)}`);
      },
      onBackingPromote: (event) => {
        events.push(`promote:${idOf(event.resource)}`);
      },
      onResolutionEnd: (event) => {
        events.push(`end:resolved=${event.resolvedCount}:promoted=${event.promotedCount}`);
      },
    };

    const resolver = createResourceGraphResolver({
      sources: [
        createStoreSource({ id: "chain", families: { chain: chainAri }, store }),
        createStoreSource({ id: "slow", families: { slow: slowAri }, store }),
      ],
      expansion: createExpansionPolicyChain([
        {
          matches: ({ resource }) => resource.equals(root),
          expand: () => ({ resources: [child, promoted] }),
        },
        {
          matches: ({ resource }) => resource.equals(promoted),
          expand: () => ({ resources: [], isIsland: true }),
        },
      ]),
      observer,
      strategy: "lane",
    });

    await resolver.resolve({
      root,
      executionContext: {},
      missingResourceMode: "throw",
      backingResources: new Map<string, unknown>([[promoted.toString(), {}]]),
    });

    expect(events[0]).toBe("start:lane:chain+slow");
    expect(events).toContain("batchStart:chain#1:1");
    expect(events).toContain("batchEnd:chain#1:1");
    expect(events).toContain("expand:P:island=false");
    expect(events).toContain("promote:S");
    expect(events).toContain("expand:S:island=true");
    expect(events.at(-1)).toBe("end:resolved=3:promoted=1");

    // The slow source is never asked for anything: its only ARI came from backing.
    expect(batchStarts.every((batch) => batch.sourceId === "chain")).toBe(true);
    expect(batchStarts[0]?.families).toEqual(["chain"]);
  });

  it("never lets an observer failure affect resolution", async () => {
    const root = chainAri({ id: "P" });
    const store = new Map<string, unknown>([[root.toString(), {}]]);

    const resolver = createResourceGraphResolver({
      sources: [createStoreSource({ id: "chain", families: { chain: chainAri }, store })],
      expansion: createExpansionPolicyChain([]),
      observer: {
        onBatchStart: () => {
          throw new Error("observer is broken");
        },
        onExpand: () => {
          throw new Error("observer is broken");
        },
      },
      strategy: "lane",
    });

    const output = await resolver.resolve({
      root,
      executionContext: {},
      missingResourceMode: "throw",
    });

    expect(output.errors).toEqual([]);
    expect(output.contentMap.has(root)).toBe(true);
  });
});

describe("unrequested records", () => {
  it("expands a resource a source volunteered while it was queued elsewhere", async () => {
    const root = chainAri({ id: "P" });
    const volunteered = slowAri({ id: "S" });
    const grandchild = chainAri({ id: "A" });

    const chainSource = createStoreSource({
      id: "chain",
      families: { chain: chainAri },
      store: new Map<string, unknown>([
        [root.toString(), {}],
        [grandchild.toString(), {}],
      ]),
    });

    // Returns `volunteered` alongside the root, before the slow source is asked.
    const eager: ResourceSource = {
      ...chainSource,
      load: async (batch, context) => {
        const records = await chainSource.load(batch, context);
        const askedForRoot = (batch.chain ?? []).some((resource: ApplicationResourceIdentifier) =>
          resource.equals(root)
        );

        return askedForRoot ? [...records, { resource: volunteered, payload: {} }] : records;
      },
    };

    const slowSource = createStoreSource({
      id: "slow",
      families: { slow: slowAri },
      store: new Map<string, unknown>(),
    });

    const resolver = createResourceGraphResolver({
      sources: [eager, slowSource],
      expansion: createExpansionPolicyChain([
        {
          matches: ({ resource }) => resource.equals(root),
          expand: () => ({ resources: [volunteered] }),
        },
        {
          matches: ({ resource }) => resource.equals(volunteered),
          expand: () => ({ resources: [grandchild], isIsland: true }),
        },
      ]),
      strategy: "barrier",
    });

    const output = await resolver.resolve({
      root,
      executionContext: {},
      missingResourceMode: "throw",
    });

    expect(output.errors).toEqual([]);
    expect(output.contentMap.has(volunteered)).toBe(true);
    // Expanded despite never being loaded, so its own child was still discovered.
    expect(output.contentMap.has(grandchild)).toBe(true);
    expect(output.islands.get(volunteered.toString())).toEqual(
      new Set([volunteered.toString(), grandchild.toString()])
    );
    expect(slowSource.batches).toEqual([]);
  });
});
