import { describe, expect, it } from "vitest";

import { createResourceGraphResolver } from "./resource-graph-resolver";
import {
  MissingResourceError,
  NoResourceSourceError,
  ResourceGraphAbortedError,
  ResourceLoadFailedError,
} from "../errors";
import { createExpansionPolicyChain, type ExpansionPolicy } from "../ports/expansion-port";
import { serializeAllIslands } from "../islands/serialize-island";
import {
  asset,
  createDeferred,
  createPageGraphPolicies,
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
  testAri,
  testAriFactory,
} from "../testing/test-fixtures";
import type { ResolutionStrategy, ResolveResourceGraphOutput } from "../types";

const strategies: readonly ResolutionStrategy[] = ["lane", "barrier"];

describe.each(strategies)("resolver semantics (%s strategy)", (strategy) => {
  it("resolves the whole graph and loads a shared resource once", async () => {
    const source = createStoreSource({ families: pageGraphFamilies });
    const output = await resolvePageGraph(strategy, { source });

    expect(output.errors).toEqual([]);
    expect(output.contentMap.size).toBe(5);
    expect(output.contentMap.get(page)).toEqual(pageGraphValues.get(page.toString()));

    const assetRequests = source.batches.filter((batch) =>
      batch.some((resource) => resource.equals(asset))
    );
    expect(assetRequests).toHaveLength(1);
  });

  it("assigns a resource reached from several islands to all of them", async () => {
    const output = await resolvePageGraph(strategy);

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
    const source = createStoreSource({ families: pageGraphFamilies, omit: [asset] });

    await expect(resolvePageGraph(strategy, { source })).rejects.toThrow(MissingResourceError);
  });

  it("collects a missing resource once, attributed to every island that reached it", async () => {
    const source = createStoreSource({ families: pageGraphFamilies, omit: [asset] });
    const output = await resolvePageGraph(strategy, { source, missingResourceMode: "collect" });

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

    await expect(resolvePageGraph(strategy, { policies })).rejects.toThrow(NoResourceSourceError);

    const output = await resolvePageGraph(strategy, { policies, missingResourceMode: "collect" });

    expect(output.errors).toHaveLength(1);
    expect(output.errors[0]?.resourceKey).toBe(orphan.toString());
    expect(output.errors[0]?.message).toContain("No resource source declares a family matching");
  });

  it("promotes backing resources without fetching them and never mutates the input map", async () => {
    const unreached = testAri("unused", "U");
    const backingResources = new Map<string, unknown>([
      [menu.toString(), { logo: { $ref: asset.toString() } }],
      [asset.toString(), { url: "https://cdn.example.com/logo.svg" }],
      [unreached.toString(), { ignored: true }],
    ]);
    const source = createStoreSource({ families: pageGraphFamilies });

    const output = await resolvePageGraph(strategy, { source, backingResources });

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
          families: { cycle: cycleAri },
          store: new Map<string, unknown>([
            [first.toString(), { next: second.toString() }],
            [second.toString(), { next: first.toString() }],
          ]),
        }),
      ],
      expansion: createExpansionPolicyChain([
        {
          matches: ({ resource }) => resource.equals(first),
          expand: () => ({ resources: [second], isIsland: true }),
        },
        {
          matches: ({ resource }) => resource.equals(second),
          expand: () => ({ resources: [first], isIsland: true }),
        },
      ]),
      strategy,
    });

    const output = await resolver.resolve({
      root: first,
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
    await expect(resolvePageGraph(strategy, { signal: AbortSignal.abort() })).rejects.toThrow(
      ResourceGraphAbortedError
    );
  });

  it("aborts while a load is in flight and still observes that load", async () => {
    const controller = new AbortController();
    const gate = createDeferred<void>();
    let loadCompleted = false;

    const source = createStoreSource({
      families: pageGraphFamilies,
      gate: async () => {
        controller.abort();
        await gate.promise;
        loadCompleted = true;
      },
    });

    const resolution = resolvePageGraph(strategy, { source, signal: controller.signal });
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
          families: { page: pageAri },
          batchSize: {},
          concurrency: 1,
          load: async (_batch, context) => {
            seenSignal = context.signal;
            return [{ resource: page, payload: {} }];
          },
        },
      ],
      expansion: createExpansionPolicyChain([]),
      strategy,
    });

    await resolver.resolve({
      root: page,
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
          families: { page: pageAri },
          batchSize: {},
          concurrency: 1,
          load: async () => {
            throw cause;
          },
        },
      ],
      expansion: createExpansionPolicyChain(createPageGraphPolicies()),
      strategy,
    });

    const failure = await resolver
      .resolve({ root: page, executionContext: {}, missingResourceMode: "throw" })
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
          families: { page: pageAri, menu: menuAri },
          store: pageGraphValues,
        }),
        {
          id: "hero-api",
          families: { hero: heroAri },
          batchSize: {},
          concurrency: 1,
          load: async () => {
            throw new Error("hero API down");
          },
        },
      ],
      expansion: createExpansionPolicyChain([
        {
          matches: ({ resource }) => resource.type === "page",
          expand: () => ({ resources: [hero, menu] }),
        },
        {
          matches: ({ resource }) => resource.type === "menu",
          expand: () => ({ resources: [], isIsland: true }),
        },
      ]),
      strategy,
    });

    const output = await resolver.resolve({
      root: page,
      executionContext: {},
      missingResourceMode: "collect",
    });

    expect(output.contentMap.has(page)).toBe(true);
    expect(output.contentMap.has(menu)).toBe(true);
    expect(output.errors).toHaveLength(1);
    expect(output.errors[0]?.resourceKey).toBe(hero.toString());
    expect(output.errors[0]?.message).toContain('Resource source "hero-api" failed to load');
    expect(output.errors[0]?.inheritedIslandIds).toEqual([page.toString()]);
  });
});

describe("strategy parity", () => {
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

  /** Two sources with diverging latency plus per-family chunking, so schedules differ. */
  async function resolveWithSplitSources(
    strategy: ResolutionStrategy
  ): Promise<ResolveResourceGraphOutput> {
    const resolver = createResourceGraphResolver({
      sources: [
        createStoreSource({
          id: "fast",
          families: { page: pageAri, hero: heroAri, menu: menuAri, footer: footerAri },
          store: pageGraphValues,
          batchSize: { menu: 1, footer: 1 },
        }),
        createStoreSource({
          id: "slow",
          families: { asset: assetAri },
          store: pageGraphValues,
          delayMs: 5,
        }),
      ],
      expansion: createExpansionPolicyChain(createPageGraphPolicies()),
      strategy,
    });

    return resolver.resolve({
      root: page,
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
