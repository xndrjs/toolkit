import { describe, expect, it } from "vitest";

import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import { createResourceGraphResolver } from "./resource-graph-resolver";
import {
  MissingResourceError,
  NoDataSourceError,
  ResolutionError,
  ResourceGraphAbortedError,
  ResourceLoadFailedError,
} from "../errors";
import { createExpansionPolicyChain, type ExpansionPolicy } from "../ports/expansion-port";
import { createIslandPolicyChain } from "../ports/island-port";
import { createGraphResolutionStrategy } from "../strategy/create-graph-resolution-strategy";
import { serializeAllIslands } from "../islands/serialize-island";
import {
  asset,
  createDeferred,
  createPageGraphIslandPolicies,
  createPageGraphPolicies,
  graphStrategy,
  createStoreSource,
  footer,
  hero,
  menu,
  page,
  pageGraphFamilies,
  pageGraphValues,
  resolvePageGraph,
} from "../testing/resolver-test-helpers";
import {
  assetAri,
  footerAri,
  heroAri,
  menuAri,
  orphanAri,
  pageAri,
  productAri,
  testAri,
  testAriFactory,
} from "../testing/test-fixtures";
import type { SchedulingMode, ResolveResourceGraphOutput } from "../types";
import type { DataSource } from "../ports/data-source";

/** Lets every pending macrotask run so any load that *can* start has started. */
async function flushMacrotasks(rounds = 12): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

const schedulingModes: readonly SchedulingMode[] = ["lane", "barrier"];

describe.each(schedulingModes)("resolver semantics (%s scheduling mode)", (schedulingMode) => {
  it("resolves the whole graph and loads a shared resource once", async () => {
    const source = createStoreSource({ for: pageGraphFamilies });
    const output = await resolvePageGraph(schedulingMode, { source });

    expect(output.errors).toEqual([]);
    expect(output.contentMap.size).toBe(5);
    expect(output.contentMap.get(page)).toEqual(pageGraphValues.get(page.toString()));

    const assetRequests = source.batches.filter((batch) =>
      batch.some((resource) => resource.equals(asset))
    );
    expect(assetRequests).toHaveLength(1);
  });

  it("assigns a resource reached from several islands to all of them", async () => {
    const output = await resolvePageGraph(schedulingMode);

    expect(output.islands.get(page.toString())).toEqual(
      new Set([page.toString(), hero.toString(), asset.toString()])
    );
    expect(output.islands.get(menu.toString())).toEqual(
      new Set([menu.toString(), asset.toString()])
    );
    expect(output.islands.get(footer.toString())).toEqual(
      new Set([footer.toString(), asset.toString()])
    );

    expect([...output.islandDependencies.get(page.toString())].sort()).toEqual(
      [footer.toString(), menu.toString()].sort()
    );
    expect(serializeAllIslands(output).map((island) => island.islandId)).toEqual(
      [footer.toString(), menu.toString(), page.toString()].sort()
    );
  });

  it("throws MissingResourceError when a source omits a requested resource", async () => {
    const source = createStoreSource({ for: pageGraphFamilies, omit: [asset] });

    await expect(resolvePageGraph(schedulingMode, { source })).rejects.toThrow(
      MissingResourceError
    );
  });

  it("collects a missing resource once, attributed to every island that reached it", async () => {
    const source = createStoreSource({ for: pageGraphFamilies, omit: [asset] });
    const output = await resolvePageGraph(schedulingMode, {
      source,
      missingResourceMode: "collect",
    });

    expect(output.errors).toHaveLength(1);
    expect(output.errors[0]?.resourceKey).toBe(asset.toString());
    expect(output.errors[0]?.inheritedIslandIds).toEqual(
      [page.toString(), menu.toString(), footer.toString()].sort()
    );
    expect(output.contentMap.has(asset)).toBe(false);
  });

  it("reports an ARI no source declares as a wiring error", async () => {
    const orphan = orphanAri({ id: "O" });
    const policies: ExpansionPolicy[] = [
      {
        matches: ({ resource }) => resource.type === "page",
        expand: () => ({ resources: [orphan] }),
      },
    ];

    await expect(resolvePageGraph(schedulingMode, { policies })).rejects.toThrow(NoDataSourceError);

    const output = await resolvePageGraph(schedulingMode, {
      policies,
      missingResourceMode: "collect",
    });

    expect(output.errors).toHaveLength(1);
    expect(output.errors[0]?.resourceKey).toBe(orphan.toString());
    expect(output.errors[0]?.message).toContain("No data source declares a family matching");
  });

  it("promotes backing resources without fetching them and never mutates the input map", async () => {
    const unreached = testAri("unused", "U");
    const backingResources = new Map<string, unknown>([
      [menu.toString(), { logo: { $ref: asset.toString() } }],
      [asset.toString(), { url: "https://cdn.example.com/logo.svg" }],
      [unreached.toString(), { ignored: true }],
    ]);
    const source = createStoreSource({ for: pageGraphFamilies });

    const output = await resolvePageGraph(schedulingMode, { source, backingResources });

    expect(backingResources.size).toBe(3);
    expect([...output.promotedResourceKeys].sort()).toEqual(
      [asset.toString(), menu.toString()].sort()
    );
    expect(output.contentMap.hasKey(unreached.toString())).toBe(false);

    const requested = source.batches.flat().map((resource) => resource.toString());
    expect(requested).not.toContain(menu.toString());
    expect(requested).not.toContain(asset.toString());

    // A promoted resource reached from three islands still joins all of them.
    expect(output.islands.get(page.toString())).toEqual(
      new Set([page.toString(), hero.toString(), asset.toString()])
    );
    expect(output.islands.get(menu.toString())).toEqual(
      new Set([menu.toString(), asset.toString()])
    );
    expect(output.islands.get(footer.toString())).toEqual(
      new Set([footer.toString(), asset.toString()])
    );
  });

  it("terminates on island cycles", async () => {
    const cycleAri = testAriFactory("cycle");
    const first = cycleAri({ id: "A" });
    const second = cycleAri({ id: "B" });

    const resolver = createResourceGraphResolver({
      sources: [
        createStoreSource({
          for: [cycleAri],
          store: new Map<string, unknown>([
            [first.toString(), { next: second.toString() }],
            [second.toString(), { next: first.toString() }],
          ]),
        }),
      ],
      strategy: graphStrategy(
        createExpansionPolicyChain([
          {
            matches: ({ resource }) => resource.equals(first),
            expand: () => ({ resources: [second] }),
          },
          {
            matches: ({ resource }) => resource.equals(second),
            expand: () => ({ resources: [first] }),
          },
        ]),
        createIslandPolicyChain([
          {
            matches: ({ resource }) => resource.equals(first),
            resolve: () => ({ startIsland: true }),
          },
          {
            matches: ({ resource }) => resource.equals(second),
            resolve: () => ({ startIsland: true }),
          },
        ])
      ),
      schedulingMode,
    });

    const output = await resolver.resolve({
      roots: [first],
      executionContext: {},
      missingResourceMode: "throw",
    });

    expect(output.errors).toEqual([]);
    expect(output.contentMap.size).toBe(2);
    expect(output.islandDependencies.getFlatDependencies(first.toString())).toEqual([
      second.toString(),
    ]);
  });

  it("throws ResourceGraphAbortedError when the signal is already aborted", async () => {
    await expect(resolvePageGraph(schedulingMode, { signal: AbortSignal.abort() })).rejects.toThrow(
      ResourceGraphAbortedError
    );
  });

  it("aborts while a load is in flight and still observes that load", async () => {
    const controller = new AbortController();
    const gate = createDeferred<void>();
    let loadCompleted = false;

    const source = createStoreSource({
      for: pageGraphFamilies,
      gate: async () => {
        controller.abort();
        await gate.promise;
        loadCompleted = true;
      },
    });

    const resolution = resolvePageGraph(schedulingMode, { source, signal: controller.signal });
    gate.resolve();

    await expect(resolution).rejects.toThrow(ResourceGraphAbortedError);
    expect(loadCompleted).toBe(true);
  });

  it("forwards the abort signal to sources so they can cancel IO", async () => {
    const controller = new AbortController();
    let seenSignal: AbortSignal | undefined;

    const resolver = createResourceGraphResolver({
      sources: [
        {
          id: "probe",
          for: [pageAri],
          concurrency: 1,
          load: async (_batch, context) => {
            seenSignal = context.signal;
            return [{ resource: page, payload: {} }];
          },
        },
      ],
      strategy: graphStrategy(createExpansionPolicyChain([]), createIslandPolicyChain([])),
      schedulingMode,
    });

    await resolver.resolve({
      roots: [page],
      executionContext: {},
      missingResourceMode: "throw",
      signal: controller.signal,
    });

    expect(seenSignal).toBe(controller.signal);
  });

  it("wraps a rejected load in ResourceLoadFailedError with the original cause", async () => {
    const cause = new Error("upstream 503");
    const resolver = createResourceGraphResolver({
      sources: [
        {
          id: "flaky",
          for: [pageAri],
          concurrency: 1,
          load: async () => {
            throw cause;
          },
        },
      ],
      strategy: graphStrategy(
        createExpansionPolicyChain(createPageGraphPolicies()),
        createIslandPolicyChain(createPageGraphIslandPolicies())
      ),
      schedulingMode,
    });

    const failure = await resolver
      .resolve({ roots: [page], executionContext: {}, missingResourceMode: "throw" })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ResourceLoadFailedError);
    expect((failure as ResourceLoadFailedError).sourceId).toBe("flaky");
    expect((failure as ResourceLoadFailedError).resourceKeys).toEqual([page.toString()]);
    expect((failure as ResourceLoadFailedError).cause).toBe(cause);
  });

  it("keeps resolving other sources when one source rejects in collect mode", async () => {
    const resolver = createResourceGraphResolver({
      sources: [
        createStoreSource({
          id: "cms",
          for: [pageAri, menuAri],
          store: pageGraphValues,
        }),
        {
          id: "hero-api",
          for: [heroAri],
          concurrency: 1,
          load: async () => {
            throw new Error("hero API down");
          },
        },
      ],
      strategy: graphStrategy(
        createExpansionPolicyChain([
          {
            matches: ({ resource }) => resource.type === "page",
            expand: () => ({ resources: [hero, menu] }),
          },
          {
            matches: ({ resource }) => resource.type === "menu",
            expand: () => ({ resources: [] }),
          },
        ]),
        createIslandPolicyChain([
          {
            matches: ({ resource }) => resource.type === "menu",
            resolve: () => ({ startIsland: true }),
          },
        ])
      ),
      schedulingMode,
    });

    const output = await resolver.resolve({
      roots: [page],
      executionContext: {},
      missingResourceMode: "collect",
    });

    expect(output.contentMap.has(page)).toBe(true);
    expect(output.contentMap.has(menu)).toBe(true);
    expect(output.errors).toHaveLength(1);
    expect(output.errors[0]).toBeInstanceOf(ResolutionError);
    expect(output.errors[0]?.code).toBe("load_failed");
    expect(output.errors[0]?.resourceKey).toBe(hero.toString());
    expect(output.errors[0]?.message).toContain('Data source "hero-api" failed to load');
    expect(output.errors[0]?.originalError).toBeInstanceOf(Error);
    expect(output.errors[0]?.inheritedIslandIds).toEqual([page.toString()]);
  });

  it("preserves a ResolutionError thrown by a datasource in throw mode", async () => {
    const upstream = new Error("token expired");
    const resolver = createResourceGraphResolver({
      sources: [
        {
          id: "auth-aware",
          for: [pageAri],
          concurrency: 1,
          load: async () => {
            throw new ResolutionError(401, "Unauthorized", upstream);
          },
        },
      ],
      strategy: graphStrategy(
        createExpansionPolicyChain(createPageGraphPolicies()),
        createIslandPolicyChain(createPageGraphIslandPolicies())
      ),
      schedulingMode,
    });

    const failure = await resolver
      .resolve({ roots: [page], executionContext: {}, missingResourceMode: "throw" })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ResolutionError);
    const resolutionError = failure as ResolutionError;
    expect(resolutionError.code).toBe(401);
    expect(resolutionError.message).toBe("Unauthorized");
    expect(resolutionError.originalError).toBe(upstream);
    expect(resolutionError.resourceKey).toBe(page.toString());
    expect(resolutionError.inheritedIslandIds).toEqual([page.toString()]);
  });

  it("collects a datasource ResolutionError into errors[] for set-error projection", async () => {
    const upstream = new Error("token expired");
    const resolver = createResourceGraphResolver({
      sources: [
        createStoreSource({
          id: "cms",
          for: [pageAri, menuAri],
          store: pageGraphValues,
        }),
        {
          id: "hero-api",
          for: [heroAri],
          concurrency: 1,
          load: async () => {
            throw new ResolutionError(401, "Unauthorized", upstream);
          },
        },
      ],
      strategy: graphStrategy(
        createExpansionPolicyChain([
          {
            matches: ({ resource }) => resource.type === "page",
            expand: () => ({ resources: [hero, menu] }),
          },
          {
            matches: ({ resource }) => resource.type === "menu",
            expand: () => ({ resources: [] }),
          },
        ]),
        createIslandPolicyChain([
          {
            matches: ({ resource }) => resource.type === "menu",
            resolve: () => ({ startIsland: true }),
          },
        ])
      ),
      schedulingMode,
    });

    const output = await resolver.resolve({
      roots: [page],
      executionContext: {},
      missingResourceMode: "collect",
    });

    expect(output.contentMap.has(page)).toBe(true);
    expect(output.contentMap.has(menu)).toBe(true);
    expect(output.errors).toHaveLength(1);
    const collected = output.errors[0]!;
    expect(collected).toBeInstanceOf(ResolutionError);
    expect(collected.code).toBe(401);
    expect(collected.message).toBe("Unauthorized");
    expect(collected.originalError).toBe(upstream);
    expect(collected.resourceKey).toBe(hero.toString());
    expect(collected.inheritedIslandIds).toEqual([page.toString()]);
  });
});

describe("scheduling mode parity", () => {
  function projectGraph(output: ResolveResourceGraphOutput) {
    const islandIds = [...output.islands.islandIds()].sort();

    return {
      content: Object.keys(output.contentMap.toJSON()).sort(),
      membership: islandIds.map((islandId) => [islandId, [...output.islands.get(islandId)].sort()]),
      dependencies: islandIds.map((islandId) => [
        islandId,
        [...output.islandDependencies.get(islandId)].sort(),
      ]),
      errors: output.errors,
      promoted: [...output.promotedResourceKeys].sort(),
    };
  }

  /** Two sources with diverging latency plus small batch size, so schedules differ. */
  async function resolveWithSplitSources(
    schedulingMode: SchedulingMode
  ): Promise<ResolveResourceGraphOutput> {
    const resolver = createResourceGraphResolver({
      sources: [
        createStoreSource({
          id: "fast",
          for: [pageAri, heroAri, menuAri, footerAri],
          store: pageGraphValues,
          batchSize: 1,
        }),
        createStoreSource({
          id: "slow",
          for: [assetAri],
          store: pageGraphValues,
          delayMs: 5,
        }),
      ],
      strategy: graphStrategy(
        createExpansionPolicyChain(createPageGraphPolicies()),
        createIslandPolicyChain(createPageGraphIslandPolicies())
      ),
      schedulingMode,
    });

    return resolver.resolve({
      roots: [page],
      executionContext: {},
      missingResourceMode: "collect",
      backingResources: new Map<string, unknown>([
        [footer.toString(), { logo: { $ref: asset.toString() } }],
      ]),
    });
  }

  it("produces identical graph output for lane and barrier", async () => {
    const lane = await resolveWithSplitSources("lane");
    const barrier = await resolveWithSplitSources("barrier");

    expect(projectGraph(lane)).toEqual(projectGraph(barrier));
    expect(lane.errors).toEqual([]);
    expect(lane.promotedResourceKeys).toEqual([footer.toString()]);
  });
});

describe("positional load contract", () => {
  it("treats undefined slots as missing and keeps batch order", async () => {
    const entryAri = testAriFactory("entry");
    const entryA = entryAri({ id: "a" });
    const entryB = entryAri({ id: "b" });

    const source: DataSource = {
      id: "cms",
      for: [entryAri],
      concurrency: 1,
      load: async (batch) =>
        batch.map((resource) => (resource.equals(entryA) ? { title: "A" } : undefined)),
    };

    const root = pageAri({ id: "P" });
    const pageSource = createStoreSource({
      id: "pages",
      for: [pageAri],
      store: new Map([[root.toString(), { title: "Home" }]]),
    });

    const resolver = createResourceGraphResolver({
      sources: [pageSource, source],
      strategy: graphStrategy(
        createExpansionPolicyChain([
          {
            matches: ({ resource }) => resource.equals(root),
            expand: () => ({ resources: [entryA, entryB] }),
          },
        ]),
        createIslandPolicyChain([])
      ),
    });

    const output = await resolver.resolve({
      roots: [root],
      executionContext: {},
      missingResourceMode: "collect",
    });

    expect(output.contentMap.get(entryA)).toEqual({ title: "A" });
    expect(output.contentMap.has(entryB)).toBe(false);
    expect(output.errors.map((e) => e.resourceKey)).toEqual([entryB.toString()]);
  });

  it("throws when load returns the wrong number of slots", async () => {
    const entryAri = testAriFactory("entry");
    const entry = entryAri({ id: "1" });

    const source: DataSource = {
      id: "cms",
      for: [entryAri],
      concurrency: 1,
      load: async () => [],
    };

    const root = pageAri({ id: "P" });
    const pageSource = createStoreSource({
      id: "pages",
      for: [pageAri],
      store: new Map([[root.toString(), {}]]),
    });

    const resolver = createResourceGraphResolver({
      sources: [pageSource, source],
      strategy: graphStrategy(
        createExpansionPolicyChain([
          {
            matches: ({ resource }) => resource.equals(root),
            expand: () => ({ resources: [entry] }),
          },
        ]),
        createIslandPolicyChain([])
      ),
    });

    await expect(
      resolver.resolve({
        roots: [root],
        executionContext: {},
        missingResourceMode: "throw",
      })
    ).rejects.toMatchObject({
      name: "ResourceBatchLengthError",
      requestedCount: 1,
      returnedCount: 0,
    });
  });
});

describe("strategy resolve redirects", () => {
  it("redirects after decode payload load without expanding the locator", async () => {
    const customRefAri = testAriFactory("customRef");
    const entryAriFactory = testAriFactory("entry");
    const customRef = customRefAri({ id: "master@foo|ENTRY|123" });
    const entry = entryAriFactory({ id: "123" });
    const hero = heroAri({ id: "123" });

    let entryLoads = 0;
    let customRefExpanded = false;

    const decodeSource: DataSource = {
      id: "custom-refs",
      for: [customRefAri],
      concurrency: 1,
      load: async (batch) =>
        batch.map(() => ({ type: "Entry", id: "123", spaceId: "s", environmentId: "e" })),
    };

    const entrySource: DataSource = {
      id: "entries",
      for: [entryAriFactory, heroAri],
      concurrency: 1,
      load: async (batch) => {
        return batch.map((resource) => {
          if (entryAriFactory.matches(resource)) {
            entryLoads += 1;
            return { type: "Hero", title: "Welcome" };
          }
          return undefined;
        });
      },
    };

    const root = pageAri({ id: "P" });
    const pageSource = createStoreSource({
      id: "pages",
      for: [pageAri],
      store: new Map([[root.toString(), {}]]),
    });

    const resolver = createResourceGraphResolver({
      sources: [pageSource, decodeSource, entrySource],
      strategy: createGraphResolutionStrategy()
        .expansion.on(pageAri)
        .expand(() => ({ resources: [customRef] }))
        .expansion.on(entryAriFactory)
        .expand(() => ({ resources: [] }))
        .expansion.on(customRefAri)
        .expand(() => {
          customRefExpanded = true;
          return { resources: [] };
        })
        .resolve.on(customRefAri)
        .when(({ payload }) => (payload as { type?: string }).type === "Entry")
        .to(() => ({ resource: entry }))
        .build(),
    });

    const output = await resolver.resolve({
      roots: [root],
      executionContext: {},
      missingResourceMode: "throw",
    });

    expect(output.errors).toEqual([]);
    expect(entryLoads).toBe(1);
    expect(customRefExpanded).toBe(false);
    expect(output.contentMap.has(hero)).toBe(false);
    expect(output.contentMap.has(entry)).toBe(true);
    expect(output.contentMap.has(customRef)).toBe(true);
    expect(output.contentMap.get(customRef)).toEqual({ type: "Hero", title: "Welcome" });
    expect(output.contentMap.get(entry)).toEqual({ type: "Hero", title: "Welcome" });
  });

  it("chooses the resolve arm from decode payload when", async () => {
    const customRefAri = testAriFactory("customRef");
    const entryAriFactory = testAriFactory("entry");
    const assetAriFactory = testAriFactory("cmsAsset");
    const customRef = customRefAri({ id: "master@foo|ASSET|456" });
    const entry = entryAriFactory({ id: "456" });
    const asset = assetAriFactory({ id: "456" });

    let entryLoads = 0;
    let assetLoads = 0;

    const decodeSource: DataSource = {
      id: "custom-refs",
      for: [customRefAri],
      concurrency: 1,
      load: async (batch) => batch.map(() => ({ type: "Asset", id: "456" })),
    };

    const entrySource: DataSource = {
      id: "entries",
      for: [entryAriFactory],
      concurrency: 1,
      load: async (batch) => {
        entryLoads += batch.length;
        return batch.map(() => ({ title: "Entry" }));
      },
    };

    const assetSource: DataSource = {
      id: "assets",
      for: [assetAriFactory],
      concurrency: 1,
      load: async (batch) => {
        assetLoads += batch.length;
        return batch.map(() => ({ url: "https://cdn/x" }));
      },
    };

    const root = pageAri({ id: "P" });
    const pageSource = createStoreSource({
      id: "pages",
      for: [pageAri],
      store: new Map([[root.toString(), {}]]),
    });

    const resolver = createResourceGraphResolver({
      sources: [pageSource, decodeSource, entrySource, assetSource],
      strategy: createGraphResolutionStrategy()
        .expansion.on(pageAri)
        .expand(() => ({ resources: [customRef] }))
        .resolve.on(customRefAri)
        .when(({ payload }) => (payload as { type?: string }).type === "Entry")
        .to(() => ({ resource: entry }))
        .resolve.on(customRefAri)
        .when(({ payload }) => (payload as { type?: string }).type === "Asset")
        .to(() => ({ resource: asset }))
        .build(),
    });

    const output = await resolver.resolve({
      roots: [root],
      executionContext: {},
      missingResourceMode: "throw",
    });

    expect(output.errors).toEqual([]);
    expect(entryLoads).toBe(0);
    expect(assetLoads).toBe(1);
    expect(output.contentMap.get(customRef)).toEqual({ url: "https://cdn/x" });
    expect(output.contentMap.get(asset)).toEqual({ url: "https://cdn/x" });
  });

  it("applies resolve policies when promoting from backingResources", async () => {
    const customRefAri = testAriFactory("customRef");
    const entryAriFactory = testAriFactory("entry");
    const customRef = customRefAri({ id: "C" });
    const entry = entryAriFactory({ id: "1" });

    const entrySource: DataSource = {
      id: "entries",
      for: [entryAriFactory],
      concurrency: 1,
      load: async (batch) => batch.map(() => ({ title: "From entry" })),
    };

    const root = pageAri({ id: "P" });
    const pageSource = createStoreSource({
      id: "pages",
      for: [pageAri],
      store: new Map([[root.toString(), {}]]),
    });

    const resolver = createResourceGraphResolver({
      sources: [pageSource, entrySource],
      strategy: createGraphResolutionStrategy()
        .expansion.on(pageAri)
        .expand(() => ({ resources: [customRef] }))
        .resolve.on(customRefAri)
        .to(() => ({ resource: entry }))
        .build(),
    });

    const output = await resolver.resolve({
      roots: [root],
      executionContext: {},
      missingResourceMode: "throw",
      backingResources: new Map([[customRef.toString(), { type: "Entry", id: "1" }]]),
    });

    expect(output.errors).toEqual([]);
    expect(output.promotedResourceKeys).toEqual([customRef.toString()]);
    expect(output.contentMap.get(customRef)).toEqual({ title: "From entry" });
    expect(output.contentMap.get(entry)).toEqual({ title: "From entry" });
  });
});

describe("multi-root seeds", () => {
  it("throws when roots is empty", async () => {
    const resolver = createResourceGraphResolver({
      sources: [createStoreSource({ for: pageGraphFamilies })],
      strategy: graphStrategy(
        createExpansionPolicyChain(createPageGraphPolicies()),
        createIslandPolicyChain(createPageGraphIslandPolicies())
      ),
    });

    await expect(
      resolver.resolve({
        roots: [],
        executionContext: {},
        missingResourceMode: "throw",
      })
    ).rejects.toMatchObject({
      name: "ResourceGraphError",
      message: "ResolveResourceGraphInput.roots must be non-empty",
    });
  });

  it("reports all seed ARIs on the resolution start event", async () => {
    const a = pageAri({ id: "A" });
    const b = pageAri({ id: "B" });
    const store = new Map<string, unknown>([
      [a.toString(), {}],
      [b.toString(), {}],
    ]);

    let seenRoots: readonly ApplicationResourceIdentifier[] | undefined;
    const resolver = createResourceGraphResolver({
      sources: [createStoreSource({ id: "pages", for: [pageAri], store })],
      strategy: graphStrategy(createExpansionPolicyChain([]), createIslandPolicyChain([])),
      observer: {
        onResolutionStart: (event) => {
          seenRoots = event.roots;
        },
      },
    });

    await resolver.resolve({
      roots: [a, b],
      executionContext: {},
      missingResourceMode: "throw",
    });

    expect(seenRoots).toEqual([a, b]);
  });

  it("enqueues every seed before any load runs", async () => {
    const a = pageAri({ id: "A" });
    const b = pageAri({ id: "B" });
    const store = new Map<string, unknown>([
      [a.toString(), {}],
      [b.toString(), {}],
    ]);

    const gate = createDeferred<void>();
    const source = createStoreSource({
      id: "pages",
      for: [pageAri],
      store,
      batchSize: 1,
      concurrency: 2,
      gate: () => gate.promise,
    });

    const resolver = createResourceGraphResolver({
      sources: [source],
      strategy: graphStrategy(createExpansionPolicyChain([]), createIslandPolicyChain([])),
      schedulingMode: "lane",
    });

    const resolution = resolver.resolve({
      roots: [a, b],
      executionContext: {},
      missingResourceMode: "throw",
    });

    await flushMacrotasks();
    expect(source.batches).toHaveLength(2);
    expect(
      source.batches
        .flat()
        .map((resource) => resource.toString())
        .sort()
    ).toEqual([a.toString(), b.toString()].sort());

    gate.resolve();
    await resolution;
  });

  it("loads the same ARI only once when listed twice in roots", async () => {
    const source = createStoreSource({
      for: [pageAri],
      store: new Map([[page.toString(), {}]]),
    });

    const resolver = createResourceGraphResolver({
      sources: [source],
      strategy: graphStrategy(createExpansionPolicyChain([]), createIslandPolicyChain([])),
    });

    const output = await resolver.resolve({
      roots: [page, page],
      executionContext: {},
      missingResourceMode: "throw",
    });

    expect(output.contentMap.size).toBe(1);
    expect(source.batches.flat()).toHaveLength(1);
  });

  it("loads a shared child once when discovered from two seed subgraphs", async () => {
    const left = pageAri({ id: "L" });
    const right = pageAri({ id: "R" });
    const shared = assetAri({ id: "shared" });

    const store = new Map<string, unknown>([
      [left.toString(), {}],
      [right.toString(), {}],
      [shared.toString(), { url: "https://cdn.example.com/shared.svg" }],
    ]);

    const source = createStoreSource({
      for: [pageAri, assetAri],
      store,
    });

    const resolver = createResourceGraphResolver({
      sources: [source],
      strategy: graphStrategy(
        createExpansionPolicyChain([
          {
            matches: ({ resource }) => resource.equals(left) || resource.equals(right),
            expand: () => ({ resources: [shared] }),
          },
        ]),
        createIslandPolicyChain([])
      ),
    });

    const output = await resolver.resolve({
      roots: [left, right],
      executionContext: {},
      missingResourceMode: "throw",
    });

    expect(output.contentMap.size).toBe(3);
    const sharedLoads = source.batches.filter((batch) =>
      batch.some((resource) => resource.equals(shared))
    );
    expect(sharedLoads).toHaveLength(1);
  });

  it("redirects when a seed is a resolve locator", async () => {
    const customRefAri = testAriFactory("customRef");
    const entryAriFactory = testAriFactory("entry");
    const customRef = customRefAri({ id: "master@foo|ENTRY|1" });
    const entry = entryAriFactory({ id: "1" });

    const decodeSource: DataSource = {
      id: "custom-refs",
      for: [customRefAri],
      concurrency: 1,
      load: async (batch) => batch.map(() => ({ type: "Entry", id: "1" })),
    };

    const entrySource: DataSource = {
      id: "entries",
      for: [entryAriFactory],
      concurrency: 1,
      load: async (batch) =>
        batch.map((resource) =>
          entryAriFactory.matches(resource) ? { title: "Seed redirect" } : undefined
        ),
    };

    const resolver = createResourceGraphResolver({
      sources: [decodeSource, entrySource],
      strategy: createGraphResolutionStrategy()
        .resolve.on(customRefAri)
        .when(({ payload }) => (payload as { type?: string }).type === "Entry")
        .to(() => ({ resource: entry }))
        .build(),
    });

    const output = await resolver.resolve({
      roots: [customRef],
      executionContext: {},
      missingResourceMode: "throw",
    });

    expect(output.errors).toEqual([]);
    expect(output.contentMap.has(customRef)).toBe(true);
    expect(output.contentMap.has(entry)).toBe(true);
    expect(output.contentMap.get(customRef)).toEqual({ title: "Seed redirect" });
    expect(output.contentMap.get(entry)).toEqual({ title: "Seed redirect" });
  });

  it("lets independent seed lanes advance while a peer source is gated", async () => {
    const fastRoot = pageAri({ id: "fast" });
    const slowRoot = productAri({ id: "slow" });
    const fastChild = heroAri({ id: "fast-child" });

    const store = new Map<string, unknown>([
      [fastRoot.toString(), {}],
      [fastChild.toString(), {}],
      [slowRoot.toString(), {}],
    ]);

    const gate = createDeferred<void>();
    const fast = createStoreSource({
      id: "fast",
      for: [pageAri, heroAri],
      store,
    });
    const slow = createStoreSource({
      id: "slow",
      for: [productAri],
      store,
      gate: () => gate.promise,
    });

    const resolver = createResourceGraphResolver({
      sources: [fast, slow],
      strategy: graphStrategy(
        createExpansionPolicyChain([
          {
            matches: ({ resource }) => resource.equals(fastRoot),
            expand: () => ({ resources: [fastChild] }),
          },
        ]),
        createIslandPolicyChain([])
      ),
      schedulingMode: "lane",
    });

    const resolution = resolver.resolve({
      roots: [fastRoot, slowRoot],
      executionContext: {},
      missingResourceMode: "throw",
    });

    await flushMacrotasks();
    expect(
      fast.batches
        .flat()
        .map((r) => r.toString())
        .sort()
    ).toEqual([fastRoot.toString(), fastChild.toString()].sort());
    expect(slow.batches).toHaveLength(1);

    gate.resolve();
    const output = await resolution;

    expect(output.contentMap.size).toBe(3);
    expect(output.contentMap.has(slowRoot)).toBe(true);
  });

  it("waits for every seed and its descendants before closing", async () => {
    const left = pageAri({ id: "L" });
    const right = pageAri({ id: "R" });
    const leftChild = heroAri({ id: "LH" });
    const rightChild = menuAri({ id: "RM" });

    const store = new Map<string, unknown>([
      [left.toString(), {}],
      [right.toString(), {}],
      [leftChild.toString(), {}],
      [rightChild.toString(), {}],
    ]);

    const resolver = createResourceGraphResolver({
      sources: [createStoreSource({ for: [pageAri, heroAri, menuAri], store })],
      strategy: graphStrategy(
        createExpansionPolicyChain([
          {
            matches: ({ resource }) => resource.equals(left),
            expand: () => ({ resources: [leftChild] }),
          },
          {
            matches: ({ resource }) => resource.equals(right),
            expand: () => ({ resources: [rightChild] }),
          },
        ]),
        createIslandPolicyChain([])
      ),
    });

    const output = await resolver.resolve({
      roots: [left, right],
      executionContext: {},
      missingResourceMode: "throw",
    });

    expect(output.errors).toEqual([]);
    expect(output.contentMap.size).toBe(4);
    expect(Object.keys(output.contentMap.toJSON()).sort()).toEqual(
      [left, right, leftChild, rightChild].map((r) => r.toString()).sort()
    );
  });
});
