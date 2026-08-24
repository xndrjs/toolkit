import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import { describe, expect, it, vi } from "vitest";

import {
  createControlledLoader,
  createDeferred,
  recordsFromStore,
  type Deferred,
} from "../testing/content-graph-engine-test-helpers";
import { LaneResolveContentGraphEngine } from "./lane-resolve-content-graph-engine";
import { createExpansionPolicyChain } from "../ports/expansion-port";
import { serializeIsland } from "../islands/serialize-island";
import { testAri } from "../testing/test-fixtures.js";
import type { ResolveContentGraphOutput } from "../types";

const page = testAri("cms.page", "P");
const cmsA = testAri("cms.block", "A");
const cmsB = testAri("cms.block", "B");
const cmsC = testAri("cms.block", "C");
const integSlow = testAri("integration.product", "S");
const shared = testAri("cms.asset", "SHARED");
const menu = testAri("cms.menu", "M");
const footer = testAri("cms.footer", "F");
const unmatched = testAri("unknown.thing", "U");

const isCms = (resource: ApplicationResourceIdentifier): boolean =>
  resource.type.startsWith("cms.");
const isIntegration = (resource: ApplicationResourceIdentifier): boolean =>
  resource.type.startsWith("integration.");

async function waitFor(predicate: () => boolean, attempts = 100): Promise<void> {
  for (let i = 0; i < attempts; i += 1) {
    if (predicate()) {
      return;
    }
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for condition");
}

/** Sequential gates: each process call awaits the next deferred in order. */
function createGateQueue() {
  const gates: Deferred<void>[] = [];
  let nextIndex = 0;

  return {
    enqueue(): Deferred<void> {
      const gate = createDeferred<void>();
      gates.push(gate);
      return gate;
    },
    gate: async () => {
      const gate = gates[nextIndex];
      if (gate === undefined) {
        throw new Error(`No gate queued for process call ${nextIndex}`);
      }
      nextIndex += 1;
      await gate.promise;
    },
  };
}

function snapshotOutput(output: ResolveContentGraphOutput) {
  return {
    content: {
      page: output.contentMap.has(page),
      menu: output.contentMap.has(menu),
      footer: output.contentMap.has(footer),
      shared: output.contentMap.get(shared),
    },
    islands: Object.fromEntries(
      [...output.islands.islandIds()]
        .sort()
        .map((islandId) => [islandId, [...output.islands.get(islandId)].sort()])
    ),
    dependencies: Object.fromEntries(
      [...output.islands.islandIds()]
        .sort()
        .map((islandId) => [islandId, [...output.islandDependencies.get(islandId)].sort()])
    ),
    errors: output.errors,
  };
}

describe("LaneResolveContentGraphEngine concurrency", () => {
  it("lets CMS run several serial batches while one integration batch stays pending", async () => {
    const store = new Map<string, unknown>([
      [page.toString(), {}],
      [cmsA.toString(), {}],
      [cmsB.toString(), {}],
      [cmsC.toString(), {}],
      [integSlow.toString(), {}],
    ]);

    const integrationGate = createDeferred<void>();
    let cmsBatchesWhileIntegrationPending = 0;

    const cms = createControlledLoader({
      label: "cms",
      accepts: isCms,
      store,
      takeLimit: 1,
      onBatchStart() {
        if (integration.currentlyInFlight.value > 0) {
          cmsBatchesWhileIntegrationPending += 1;
        }
      },
    });

    const integration = createControlledLoader({
      label: "integration",
      accepts: isIntegration,
      store,
      takeLimit: 1,
      gate: () => integrationGate.promise,
    });

    const engine = new LaneResolveContentGraphEngine(
      [cms, integration],
      createExpansionPolicyChain([
        {
          matches: ({ resource }) => resource.equals(page),
          expand: () => ({ resources: [cmsA, integSlow] }),
        },
        {
          matches: ({ resource }) => resource.equals(cmsA),
          expand: () => ({ resources: [cmsB] }),
        },
        {
          matches: ({ resource }) => resource.equals(cmsB),
          expand: () => ({ resources: [cmsC] }),
        },
        {
          matches: () => true,
          expand: () => ({ resources: [] }),
        },
      ])
    );

    const run = engine.execute({
      root: page,
      executionContext: {},
      missingResourceMode: "throw",
    });

    await waitFor(() => integration.process.mock.calls.length >= 1);
    await waitFor(() => cms.takenBatches.length >= 4);

    expect(integration.currentlyInFlight.value).toBe(1);
    expect(cmsBatchesWhileIntegrationPending).toBeGreaterThanOrEqual(2);
    expect(cms.inFlightPeak.value).toBe(1);
    expect(integration.inFlightPeak.value).toBe(1);

    integrationGate.resolve();
    const output = await run;

    expect(cms.takenBatches.map((batch) => batch.map(String))).toEqual([
      [page.toString()],
      [cmsA.toString()],
      [cmsB.toString()],
      [cmsC.toString()],
    ]);
    expect(integration.takenBatches).toEqual([[integSlow]]);
    expect(output.contentMap.has(cmsC)).toBe(true);
    expect(output.contentMap.has(integSlow)).toBe(true);
    expect(output.errors).toEqual([]);
  });

  it("keeps max in-flight at one per loader while different loaders overlap", async () => {
    const store = new Map<string, unknown>([
      [page.toString(), {}],
      [cmsA.toString(), {}],
      [integSlow.toString(), {}],
    ]);

    const cmsGates = createGateQueue();
    const integrationGates = createGateQueue();
    const pageGate = cmsGates.enqueue();
    const cmsAGate = cmsGates.enqueue();
    const integGate = integrationGates.enqueue();

    let observedOverlap = false;

    const cms = createControlledLoader({
      label: "cms",
      accepts: isCms,
      store,
      takeLimit: 1,
      gate: cmsGates.gate,
      onBatchStart() {
        if (integration.currentlyInFlight.value > 0) {
          observedOverlap = true;
        }
      },
    });

    const integration = createControlledLoader({
      label: "integration",
      accepts: isIntegration,
      store,
      takeLimit: 1,
      gate: integrationGates.gate,
      onBatchStart() {
        if (cms.currentlyInFlight.value > 0) {
          observedOverlap = true;
        }
      },
    });

    const engine = new LaneResolveContentGraphEngine(
      [cms, integration],
      createExpansionPolicyChain([
        {
          matches: ({ resource }) => resource.equals(page),
          expand: () => ({ resources: [cmsA, integSlow] }),
        },
        {
          matches: () => true,
          expand: () => ({ resources: [] }),
        },
      ])
    );

    const run = engine.execute({
      root: page,
      executionContext: {},
      missingResourceMode: "throw",
    });

    await waitFor(() => cms.process.mock.calls.length === 1);
    pageGate.resolve();

    await waitFor(
      () => cms.process.mock.calls.length === 2 && integration.process.mock.calls.length === 1
    );
    await waitFor(
      () => cms.currentlyInFlight.value === 1 && integration.currentlyInFlight.value === 1
    );

    expect(observedOverlap).toBe(true);
    expect(cms.inFlightPeak.value).toBe(1);
    expect(integration.inFlightPeak.value).toBe(1);
    expect(cms.process.mock.calls.length).toBe(2);

    cmsAGate.resolve();
    integGate.resolve();
    const output = await run;

    expect(output.contentMap.has(cmsA)).toBe(true);
    expect(output.contentMap.has(integSlow)).toBe(true);
    expect(cms.inFlightPeak.value).toBe(1);
    expect(integration.inFlightPeak.value).toBe(1);
  });

  it("produces identical islands and errors regardless of loader completion order", async () => {
    const store = new Map<string, unknown>([
      [page.toString(), {}],
      [menu.toString(), {}],
      [footer.toString(), {}],
      [shared.toString(), { url: "/logo.svg" }],
    ]);

    async function resolveWithPreferredLane(
      prefer: "cms" | "integration"
    ): Promise<ResolveContentGraphOutput> {
      const cmsGates = createGateQueue();
      const integrationGates = createGateQueue();

      // Calls: page (cms), then menu (cms) + footer (integration) overlap, then shared (cms) once.
      const pageGate = cmsGates.enqueue();
      const menuGate = cmsGates.enqueue();
      const sharedGate = cmsGates.enqueue();
      const footerGate = integrationGates.enqueue();

      const cms = createControlledLoader({
        label: "cms",
        accepts: (resource) => isCms(resource) && !resource.equals(footer),
        store,
        takeLimit: 1,
        gate: cmsGates.gate,
      });
      const integration = createControlledLoader({
        label: "integration",
        accepts: (resource) => resource.equals(footer),
        store,
        takeLimit: 1,
        gate: integrationGates.gate,
      });

      const engine = new LaneResolveContentGraphEngine(
        [cms, integration],
        createExpansionPolicyChain([
          {
            matches: ({ resource }) => resource.equals(page),
            expand: () => ({ resources: [menu, footer] }),
          },
          {
            matches: ({ resource }) => resource.equals(menu),
            expand: () => ({ resources: [shared], isIsland: true }),
          },
          {
            matches: ({ resource }) => resource.equals(footer),
            expand: () => ({ resources: [shared], isIsland: true }),
          },
          {
            matches: () => true,
            expand: () => ({ resources: [] }),
          },
        ])
      );

      const run = engine.execute({
        root: page,
        executionContext: {},
        missingResourceMode: "throw",
      });

      await waitFor(() => cms.process.mock.calls.length === 1);
      pageGate.resolve();

      await waitFor(
        () => cms.process.mock.calls.length === 2 && integration.process.mock.calls.length === 1
      );

      if (prefer === "cms") {
        menuGate.resolve();
        await waitFor(() => cms.process.mock.calls.length === 3);
        sharedGate.resolve();
        footerGate.resolve();
      } else {
        footerGate.resolve();
        await waitFor(() => cms.currentlyInFlight.value === 1);
        menuGate.resolve();
        await waitFor(() => cms.process.mock.calls.length === 3);
        sharedGate.resolve();
      }

      return run;
    }

    const cmsFirst = snapshotOutput(await resolveWithPreferredLane("cms"));
    const integrationFirst = snapshotOutput(await resolveWithPreferredLane("integration"));

    expect(cmsFirst).toEqual(integrationFirst);
    expect(cmsFirst.islands[menu.toString()]).toEqual([menu.toString(), shared.toString()].sort());
    expect(cmsFirst.islands[footer.toString()]).toEqual(
      [footer.toString(), shared.toString()].sort()
    );
    expect(cmsFirst.errors).toEqual([]);
  });

  it("loads a shared ARI once while retaining every island membership", async () => {
    const store = new Map<string, unknown>([
      [page.toString(), {}],
      [menu.toString(), {}],
      [footer.toString(), {}],
      [shared.toString(), { url: "/logo.svg" }],
    ]);

    const cms = createControlledLoader({
      label: "cms",
      accepts: () => true,
      store,
    });

    const engine = new LaneResolveContentGraphEngine(
      [cms],
      createExpansionPolicyChain([
        {
          matches: ({ resource }) => resource.equals(page),
          expand: () => ({ resources: [menu, footer] }),
        },
        {
          matches: ({ resource }) => resource.equals(menu),
          expand: () => ({ resources: [shared], isIsland: true }),
        },
        {
          matches: ({ resource }) => resource.equals(footer),
          expand: () => ({ resources: [shared], isIsland: true }),
        },
        {
          matches: () => true,
          expand: () => ({ resources: [] }),
        },
      ])
    );

    const output = await engine.execute({
      root: page,
      executionContext: {},
      missingResourceMode: "throw",
    });

    const sharedLoads = cms.takenBatches.filter((batch) =>
      batch.some((resource) => resource.equals(shared))
    );
    expect(sharedLoads).toHaveLength(1);

    expect(output.islands.get(menu.toString())).toEqual(
      new Set([menu.toString(), shared.toString()])
    );
    expect(output.islands.get(footer.toString())).toEqual(
      new Set([footer.toString(), shared.toString()])
    );

    const menuSerialized = serializeIsland(menu.toString(), output);
    const footerSerialized = serializeIsland(footer.toString(), output);
    expect(menuSerialized.resources[shared.toString()]).toEqual({ url: "/logo.svg" });
    expect(footerSerialized.resources[shared.toString()]).toEqual({ url: "/logo.svg" });
  });

  it("marks unmatched ARIs missing according to missingResourceMode", async () => {
    const store = new Map<string, unknown>([[page.toString(), {}]]);

    const policies = [
      {
        matches: ({ resource }: { resource: ApplicationResourceIdentifier }) =>
          resource.equals(page),
        expand: () => ({ resources: [unmatched] }),
      },
      {
        matches: () => true,
        expand: () => ({ resources: [] }),
      },
    ];

    await expect(
      new LaneResolveContentGraphEngine(
        [createControlledLoader({ label: "cms", accepts: isCms, store })],
        createExpansionPolicyChain(policies)
      ).execute({
        root: page,
        executionContext: {},
        missingResourceMode: "throw",
      })
    ).rejects.toThrow(`Unable to resolve ${unmatched.toString()}`);

    const collected = await new LaneResolveContentGraphEngine(
      [createControlledLoader({ label: "cms", accepts: isCms, store })],
      createExpansionPolicyChain(policies)
    ).execute({
      root: page,
      executionContext: {},
      missingResourceMode: "collect",
    });

    expect(collected.errors).toEqual([
      {
        resourceKey: unmatched.toString(),
        message: `Unable to resolve ${unmatched.toString()}`,
        inheritedIslandIds: [page.toString()],
      },
    ]);
  });

  it("treats omitted taken records as missing", async () => {
    const store = new Map<string, unknown>([
      [page.toString(), {}],
      [cmsA.toString(), {}],
    ]);

    const policies = [
      {
        matches: ({ resource }: { resource: ApplicationResourceIdentifier }) =>
          resource.equals(page),
        expand: () => ({ resources: [cmsA] }),
      },
      {
        matches: () => true,
        expand: () => ({ resources: [] }),
      },
    ];

    const omitCmsA = async (pull: {
      take: (
        accept: (resource: ApplicationResourceIdentifier) => boolean,
        limit?: number
      ) => ApplicationResourceIdentifier[];
    }) => {
      const taken = pull.take(() => true);
      return recordsFromStore(
        taken.filter((resource) => !resource.equals(cmsA)),
        store
      );
    };

    await expect(
      new LaneResolveContentGraphEngine(
        [{ accepts: () => true, process: omitCmsA }],
        createExpansionPolicyChain(policies)
      ).execute({
        root: page,
        executionContext: {},
        missingResourceMode: "throw",
      })
    ).rejects.toThrow(`Unable to resolve ${cmsA.toString()}`);

    const collected = await new LaneResolveContentGraphEngine(
      [{ accepts: () => true, process: omitCmsA }],
      createExpansionPolicyChain(policies)
    ).execute({
      root: page,
      executionContext: {},
      missingResourceMode: "collect",
    });

    expect(collected.errors.map((error) => error.resourceKey)).toEqual([cmsA.toString()]);
  });

  it("observes remaining in-flight loaders when one lane throws", async () => {
    const store = new Map<string, unknown>([
      [page.toString(), {}],
      [cmsA.toString(), {}],
      [integSlow.toString(), {}],
    ]);

    const cmsGates = createGateQueue();
    const integrationGates = createGateQueue();
    const pageGate = cmsGates.enqueue();
    const cmsAGate = cmsGates.enqueue();
    const integGate = integrationGates.enqueue();

    let integrationSettled = false;

    const cms = createControlledLoader({
      label: "cms",
      accepts: isCms,
      store,
      takeLimit: 1,
      gate: cmsGates.gate,
    });

    const integrationProcess = vi.fn(async (pull) => {
      pull.take(() => true, 1);
      try {
        await integrationGates.gate();
        throw new Error("integration boom");
      } finally {
        integrationSettled = true;
      }
    });

    const engine = new LaneResolveContentGraphEngine(
      [cms, { accepts: isIntegration, process: integrationProcess }],
      createExpansionPolicyChain([
        {
          matches: ({ resource }) => resource.equals(page),
          expand: () => ({ resources: [cmsA, integSlow] }),
        },
        {
          matches: () => true,
          expand: () => ({ resources: [] }),
        },
      ])
    );

    const run = engine.execute({
      root: page,
      executionContext: {},
      missingResourceMode: "throw",
    });

    await waitFor(() => cms.process.mock.calls.length === 1);
    pageGate.resolve();

    await waitFor(
      () => cms.process.mock.calls.length === 2 && integrationProcess.mock.calls.length === 1
    );

    expect(cms.currentlyInFlight.value).toBe(1);
    integGate.resolve();
    await waitFor(() => integrationSettled);
    expect(cms.currentlyInFlight.value).toBe(1);

    cmsAGate.resolve();
    await expect(run).rejects.toThrow("integration boom");
    expect(cms.currentlyInFlight.value).toBe(0);
  });

  it("aborts cooperatively and does not start work when already aborted", async () => {
    const store = new Map<string, unknown>([[page.toString(), {}]]);

    const controller = new AbortController();
    const loader = createControlledLoader({
      label: "cms",
      accepts: () => true,
      store,
      gate: async () => {
        controller.abort("stop");
      },
    });

    await expect(
      new LaneResolveContentGraphEngine(
        [loader],
        createExpansionPolicyChain([
          {
            matches: () => true,
            expand: () => ({ resources: [] }),
          },
        ])
      ).execute({
        root: page,
        executionContext: {},
        missingResourceMode: "collect",
        signal: controller.signal,
      })
    ).rejects.toMatchObject({
      name: "ResolveContentGraphAbortedError",
      cause: "stop",
    });

    const preAborted = new AbortController();
    preAborted.abort();
    const idle = createControlledLoader({
      label: "cms",
      accepts: () => true,
      store,
    });

    await expect(
      new LaneResolveContentGraphEngine(
        [idle],
        createExpansionPolicyChain([
          {
            matches: () => true,
            expand: () => ({ resources: [] }),
          },
        ])
      ).execute({
        root: page,
        executionContext: {},
        missingResourceMode: "collect",
        signal: preAborted.signal,
      })
    ).rejects.toMatchObject({ name: "ResolveContentGraphAbortedError" });

    expect(idle.process).not.toHaveBeenCalled();
  });
});
