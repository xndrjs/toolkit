import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import { describe, expect, it, vi } from "vitest";

import { ResourceGraphBudgetExceededError, ResourceGraphError } from "../errors";
import { createExpansionPolicyChain } from "../ports/expansion-port";
import { createIslandPolicyChain } from "../ports/island-port";
import {
  createDeferred,
  createStoreSource,
  graphStrategy,
  pageGraphFamilies,
} from "../testing/resolver-test-helpers";
import { heroAri, menuAri, pageAri } from "../testing/test-fixtures";
import type { SchedulingMode } from "../types";
import { createResourceGraphResolver } from "./resource-graph-resolver";
import { DEFAULT_RESOLUTION_BUDGET } from "./resolution-budget";

function staticGraphStrategy(children: readonly ApplicationResourceIdentifier[]) {
  return graphStrategy(
    createExpansionPolicyChain([
      {
        matches: ({ resource }) => pageAri.matches(resource),
        expand: () => ({ resources: children }),
      },
    ]),
    createIslandPolicyChain([])
  );
}

describe("resolution budgets", () => {
  it("publishes finite safe defaults", () => {
    expect(DEFAULT_RESOLUTION_BUDGET).toEqual({
      maxNodes: 10_000,
      maxEdges: 50_000,
      maxBatches: 1_000,
      maxDurationMs: 30_000,
    });
    expect(Object.isFrozen(DEFAULT_RESOLUTION_BUDGET)).toBe(true);
  });

  it.each([
    ["maxNodes", 0],
    ["maxEdges", -1],
    ["maxBatches", 1.5],
    ["maxDurationMs", Number.POSITIVE_INFINITY],
    ["maxDurationMs", 2_147_483_648],
  ] as const)("rejects an invalid %s configuration", (name, value) => {
    expect(() =>
      createResourceGraphResolver({
        sources: [],
        strategy: staticGraphStrategy([]),
        budget: { [name]: value },
      })
    ).toThrow(ResourceGraphError);
  });

  it("stops before scheduling a node beyond maxNodes", async () => {
    const root = pageAri({ id: "root" });
    const first = heroAri({ id: "first" });
    const second = menuAri({ id: "second" });
    const events: unknown[] = [];
    const resolver = createResourceGraphResolver({
      sources: [
        createStoreSource({
          for: pageGraphFamilies,
          store: new Map([
            [root.toString(), {}],
            [first.toString(), {}],
            [second.toString(), {}],
          ]),
        }),
      ],
      strategy: staticGraphStrategy([first, second]),
      budget: { maxNodes: 2 },
      observer: { onBudgetExceeded: (event) => events.push(event) },
    });

    await expect(resolver.resolve({ roots: [root], executionContext: {} })).rejects.toMatchObject({
      name: "ResourceGraphBudgetExceededError",
      budget: "maxNodes",
      limit: 2,
      actual: 3,
      usage: { nodes: 3, edges: 2, batches: 1, durationMs: expect.any(Number) },
    } satisfies Partial<ResourceGraphBudgetExceededError>);
    expect(events).toHaveLength(1);
  });

  it("counts distinct expansion edges and reports the edge budget", async () => {
    const root = pageAri({ id: "root" });
    const first = heroAri({ id: "first" });
    const second = menuAri({ id: "second" });
    const resolver = createResourceGraphResolver({
      sources: [
        createStoreSource({
          for: pageGraphFamilies,
          store: new Map([[root.toString(), {}]]),
        }),
      ],
      strategy: staticGraphStrategy([first, first, second]),
      budget: { maxEdges: 1 },
    });

    await expect(resolver.resolve({ roots: [root], executionContext: {} })).rejects.toMatchObject({
      budget: "maxEdges",
      limit: 1,
      actual: 2,
      usage: { nodes: 2, edges: 2, batches: 1 },
    });
  });

  it("does not start a datasource call beyond maxBatches", async () => {
    const first = pageAri({ id: "first" });
    const second = pageAri({ id: "second" });
    const source = createStoreSource({
      for: [pageAri],
      batchSize: 1,
      store: new Map([
        [first.toString(), {}],
        [second.toString(), {}],
      ]),
    });
    const resolver = createResourceGraphResolver({
      sources: [source],
      strategy: staticGraphStrategy([]),
      budget: { maxBatches: 1 },
    });

    await expect(
      resolver.resolve({ roots: [first, second], executionContext: {} })
    ).rejects.toMatchObject({
      budget: "maxBatches",
      limit: 1,
      actual: 2,
    });
    expect(source.load).toHaveBeenCalledTimes(1);
  });

  it.each(["lane", "barrier"] satisfies readonly SchedulingMode[])(
    "enforces maxDurationMs while a non-cooperative loader is pending in %s mode",
    async (schedulingMode) => {
      const root = pageAri({ id: "root" });
      const gate = createDeferred<void>();
      let loadSignal: AbortSignal | undefined;
      const source = createStoreSource({
        for: [pageAri],
        store: new Map([[root.toString(), {}]]),
        gate: async () => gate.promise,
      });
      source.load.mockImplementationOnce(async (batch, context) => {
        loadSignal = context.signal;
        await gate.promise;
        return batch.map(() => ({}));
      });
      const onResolutionEnd = vi.fn();
      const onBudgetExceeded = vi.fn();
      const resolver = createResourceGraphResolver({
        sources: [source],
        strategy: staticGraphStrategy([]),
        schedulingMode,
        budget: { maxDurationMs: 20 },
        observer: { onBudgetExceeded, onResolutionEnd },
      });

      await expect(resolver.resolve({ roots: [root], executionContext: {} })).rejects.toMatchObject(
        {
          name: "ResourceGraphBudgetExceededError",
          budget: "maxDurationMs",
          limit: 20,
        }
      );

      expect(loadSignal?.aborted).toBe(true);
      expect(loadSignal?.reason).toBeInstanceOf(ResourceGraphBudgetExceededError);
      expect(onBudgetExceeded).toHaveBeenCalledTimes(1);
      expect(onResolutionEnd).not.toHaveBeenCalled();
      gate.resolve();
    }
  );

  it("reports effective defaults and final usage to observers", async () => {
    const root = pageAri({ id: "root" });
    const starts: unknown[] = [];
    const ends: unknown[] = [];
    const resolver = createResourceGraphResolver({
      sources: [
        createStoreSource({
          for: [pageAri],
          store: new Map([[root.toString(), {}]]),
        }),
      ],
      strategy: staticGraphStrategy([]),
      observer: {
        onResolutionStart: (event) => starts.push(event),
        onResolutionEnd: (event) => ends.push(event),
      },
    });

    await resolver.resolve({ roots: [root], executionContext: {} });

    expect(starts).toHaveLength(1);
    expect(starts[0]).toMatchObject({ budget: DEFAULT_RESOLUTION_BUDGET });
    expect(ends).toHaveLength(1);
    expect(ends[0]).toMatchObject({
      budgetUsage: { nodes: 1, edges: 0, batches: 1 },
    });
  });
});
