import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import { describe, expect, it, vi } from "vitest";

import type { DataResolutionPort } from "./data-resolution-port";
import { createExpansionPolicyChain, type ExpansionPolicy } from "./expansion-port";
import { ResolveContentGraphEngine } from "./resolve-content-graph-engine";
import { serializeIsland } from "./serialize-island";
import { testAri } from "./test-fixtures.js";

const page = testAri("page", "P");
const hero = testAri("hero", "H");
const menu = testAri("menu", "M");
const footer = testAri("footer", "F");
const asset = testAri("asset", "A");
const missing = testAri("missing", "X");

const values = new Map<string, unknown>([
  [
    page.toString(),
    {
      title: "Homepage",
      hero: { $ref: hero.toString() },
      menu: { $ref: menu.toString() },
      footer: { $ref: footer.toString() },
    },
  ],
  [hero.toString(), { image: { $ref: asset.toString() } }],
  [menu.toString(), { logo: { $ref: asset.toString() } }],
  [footer.toString(), { logo: { $ref: asset.toString() } }],
  [asset.toString(), { url: "https://cdn.example.com/logo.svg" }],
]);

function createInMemoryPort(store: ReadonlyMap<string, unknown> = values): DataResolutionPort & {
  process: ReturnType<typeof vi.fn>;
  takenBatches: ApplicationResourceIdentifier[][];
} {
  const takenBatches: ApplicationResourceIdentifier[][] = [];

  return {
    takenBatches,
    process: vi.fn(async (pull) => {
      const taken = pull.take(() => true);
      takenBatches.push(taken);
      const result = new Map<string, unknown>();
      for (const resource of taken) {
        const key = resource.toString();
        if (store.has(key)) {
          result.set(key, store.get(key));
        }
      }
      return result;
    }),
  };
}

function createPageGraphPolicies(): ExpansionPolicy[] {
  return [
    {
      matches: ({ resource }) => resource.type === "page",
      expand: () => ({ resources: [hero, menu, footer] }),
    },
    {
      matches: ({ resource }) => resource.type === "hero",
      expand: () => ({ resources: [asset] }),
    },
    {
      matches: ({ resource }) => resource.type === "menu",
      expand: () => ({ resources: [asset], isIsland: true }),
    },
    {
      matches: ({ resource }) => resource.type === "footer",
      expand: () => ({ resources: [asset], isIsland: true }),
    },
    {
      matches: ({ resource }) => resource.type === "asset",
      expand: () => ({ resources: [] }),
    },
  ];
}

describe("ResolveContentGraphEngine", () => {
  it("pulls the data port per frontier round, shares ContentMap keys, and isolates menu/footer islands", async () => {
    const dataPort = createInMemoryPort();
    const engine = new ResolveContentGraphEngine(
      dataPort,
      createExpansionPolicyChain(createPageGraphPolicies())
    );

    const output = await engine.execute({
      root: page,
      executionContext: {},
      missingResourceMode: "throw",
    });

    // Eager port takes the whole frontier each round
    expect(dataPort.process).toHaveBeenCalledTimes(3);
    expect(dataPort.takenBatches).toEqual([[page], [hero, menu, footer], [asset]]);

    const assetRequestCount = dataPort.takenBatches.filter((batch) =>
      batch.some((resource) => resource.equals(asset))
    ).length;
    expect(assetRequestCount).toBe(1);

    const assetValue = output.contentMap.get(asset);
    expect(assetValue).toEqual({ url: "https://cdn.example.com/logo.svg" });
    expect(output.contentMap.getByKey(asset.toString())).toBe(assetValue);

    expect(output.islands.get(page.toString())).toEqual(
      new Set([page.toString(), hero.toString(), asset.toString()])
    );
    expect(output.islands.get(menu.toString())).toEqual(
      new Set([menu.toString(), asset.toString()])
    );
    expect(output.islands.get(footer.toString())).toEqual(
      new Set([footer.toString(), asset.toString()])
    );

    expect(output.islandDependencies.get(page.toString())).toEqual(
      new Set([menu.toString(), footer.toString()])
    );
    expect(output.islandDependencies.get(menu.toString()).size).toBe(0);
    expect(output.islandDependencies.get(footer.toString()).size).toBe(0);
    expect(output.errors).toEqual([]);

    const pageSerialized = serializeIsland(page.toString(), output);
    const menuSerialized = serializeIsland(menu.toString(), output);
    const footerSerialized = serializeIsland(footer.toString(), output);

    expect(pageSerialized.resources[asset.toString()]).toBe(assetValue);
    expect(menuSerialized.resources[asset.toString()]).toBe(assetValue);
    expect(footerSerialized.resources[asset.toString()]).toBe(assetValue);
    expect(pageSerialized.resources[menu.toString()]).toBeUndefined();
    expect(pageSerialized.resources[footer.toString()]).toBeUndefined();
    expect(pageSerialized.dependencies).toEqual(
      expect.arrayContaining([menu.toString(), footer.toString()])
    );
  });

  it("re-queues deferred resources so a capped port can saturate later rounds", async () => {
    const store = values;
    const takenBatches: ApplicationResourceIdentifier[][] = [];

    const dataPort: DataResolutionPort = {
      async process(pull) {
        const taken = pull.take(() => true, 1);
        takenBatches.push(taken);

        const result = new Map<string, unknown>();
        for (const resource of taken) {
          const key = resource.toString();
          if (store.has(key)) {
            result.set(key, store.get(key));
          }
        }
        return result;
      },
    };

    const engine = new ResolveContentGraphEngine(
      dataPort,
      createExpansionPolicyChain(createPageGraphPolicies())
    );

    const output = await engine.execute({
      root: page,
      executionContext: {},
      missingResourceMode: "throw",
    });

    // After page: hero/menu/footer are frontier; cap 1 takes hero, leaves menu/footer.
    // Expanding hero enqueues asset → next rounds can mix leftovers with children.
    expect(takenBatches[0]).toEqual([page]);
    expect(takenBatches[1]).toEqual([hero]);
    expect(takenBatches.some((batch) => batch.some((r) => r.equals(menu)))).toBe(true);
    expect(takenBatches.some((batch) => batch.some((r) => r.equals(footer)))).toBe(true);
    expect(takenBatches.some((batch) => batch.some((r) => r.equals(asset)))).toBe(true);
    expect(output.contentMap.has(asset)).toBe(true);
    expect(output.errors).toEqual([]);
  });

  it("terminates graph cycles via visited (island, resource) pairs", async () => {
    type CycleRegistry = {
      node: { next: string };
    };

    const a = testAri("node", "A");
    const b = testAri("node", "B");
    const store = new Map<string, CycleRegistry["node"]>([
      [a.toString(), { next: b.toString() }],
      [b.toString(), { next: a.toString() }],
    ]);
    const dataPort = {
      takenBatches: [] as ApplicationResourceIdentifier[][],
      process: vi.fn(async (pull) => {
        const taken = pull.take(() => true);
        dataPort.takenBatches.push(taken);
        const result = new Map<string, CycleRegistry["node"]>();
        for (const resource of taken) {
          const key = resource.toString();
          if (store.has(key)) {
            result.set(key, store.get(key)!);
          }
        }
        return result;
      }),
    } satisfies DataResolutionPort<CycleRegistry> & {
      takenBatches: ApplicationResourceIdentifier[][];
      process: ReturnType<typeof vi.fn>;
    };

    const engine = new ResolveContentGraphEngine<CycleRegistry>(
      dataPort,
      createExpansionPolicyChain<CycleRegistry>([
        {
          matches: () => true,
          expand: ({ resource, contentMap }) => {
            const value = contentMap.get(resource as ApplicationResourceIdentifier<"node">);
            const childKey = value?.next;
            if (childKey === b.toString()) {
              return { resources: [b] };
            }
            if (childKey === a.toString()) {
              return { resources: [a] };
            }
            return { resources: [] };
          },
        },
      ])
    );

    const output = await engine.execute({
      root: a,
      executionContext: {},
      missingResourceMode: "throw",
    });

    expect(output.islands.get(a.toString())).toEqual(new Set([a.toString(), b.toString()]));
    expect(dataPort.process).toHaveBeenCalledTimes(2);
  });

  it("collect mode does not throw, skips missing serialization, and marks islands partial", async () => {
    const store = new Map(values);
    store.delete(menu.toString());

    const dataPort = createInMemoryPort(store);
    const engine = new ResolveContentGraphEngine(
      dataPort,
      createExpansionPolicyChain(createPageGraphPolicies())
    );

    const output = await engine.execute({
      root: page,
      executionContext: {},
      missingResourceMode: "collect",
    });

    expect(output.contentMap.has(menu)).toBe(false);
    expect(output.islands.get(menu.toString()).size).toBe(0);
    expect(output.errors).toHaveLength(1);
    expect(output.errors[0]?.resourceKey).toBe(menu.toString());
    expect(output.errors[0]?.inheritedIslandIds).toEqual([page.toString()]);
    expect(output.islands.get(page.toString())).toEqual(
      new Set([page.toString(), hero.toString(), asset.toString()])
    );
    expect(output.islandDependencies.get(page.toString())).toEqual(new Set([footer.toString()]));

    const pageSerialized = serializeIsland(page.toString(), output);
    expect(pageSerialized.completeness).toBe("partial");
    expect(pageSerialized.missingResources).toEqual([menu.toString()]);
    expect(pageSerialized.resources[menu.toString()]).toBeUndefined();
    expect(pageSerialized.dependencies).toEqual([footer.toString()]);

    const footerSerialized = serializeIsland(footer.toString(), output);
    expect(footerSerialized.completeness).toBe("complete");
    expect(footerSerialized.missingResources).toEqual([]);
  });

  it("throws on the first missing resource in throw mode", async () => {
    const store = new Map(values);
    store.delete(hero.toString());

    const dataPort = createInMemoryPort(store);
    const engine = new ResolveContentGraphEngine(
      dataPort,
      createExpansionPolicyChain(createPageGraphPolicies())
    );

    await expect(
      engine.execute({
        root: page,
        executionContext: {},
        missingResourceMode: "throw",
      })
    ).rejects.toThrow(`Unable to resolve ${hero.toString()}`);
  });

  it("promotes resolvedResourceCache hits into ContentMap and skips DataResolutionPort pulls", async () => {
    const dataPort = createInMemoryPort();
    const engine = new ResolveContentGraphEngine(
      dataPort,
      createExpansionPolicyChain(createPageGraphPolicies())
    );

    const cachedAsset = { url: "https://cdn.example.com/from-cache.svg" };
    const resolvedResourceCache = new Map<string, unknown>([
      [page.toString(), values.get(page.toString())],
      [hero.toString(), values.get(hero.toString())],
      [menu.toString(), values.get(menu.toString())],
      [footer.toString(), values.get(footer.toString())],
      [asset.toString(), cachedAsset],
    ]);

    const output = await engine.execute({
      root: page,
      executionContext: {},
      missingResourceMode: "throw",
      resolvedResourceCache,
    });

    expect(dataPort.process).not.toHaveBeenCalled();
    expect(dataPort.takenBatches).toEqual([]);
    expect(output.contentMap.get(asset)).toEqual(cachedAsset);
    expect(output.contentMap.has(page)).toBe(true);
    expect(output.contentMap.has(hero)).toBe(true);
    expect(output.contentMap.has(menu)).toBe(true);
    expect(output.contentMap.has(footer)).toBe(true);
    expect(resolvedResourceCache.size).toBe(0);
    expect(output.errors).toEqual([]);
  });

  it("does not put unreached resolvedResourceCache entries into ContentMap", async () => {
    const dataPort = createInMemoryPort();
    const engine = new ResolveContentGraphEngine(
      dataPort,
      createExpansionPolicyChain(createPageGraphPolicies())
    );

    const orphan = testAri("orphan", "O");
    const orphanValue = { label: "never reached" };
    const resolvedResourceCache = new Map<string, unknown>([[orphan.toString(), orphanValue]]);

    const output = await engine.execute({
      root: page,
      executionContext: {},
      missingResourceMode: "throw",
      resolvedResourceCache,
    });

    expect(output.contentMap.has(orphan)).toBe(false);
    expect(output.contentMap.getByKey(orphan.toString())).toBeUndefined();
    expect(resolvedResourceCache.get(orphan.toString())).toBe(orphanValue);
    expect(output.contentMap.has(page)).toBe(true);
    expect(output.contentMap.has(asset)).toBe(true);
  });

  it("deletes promoted keys from the caller-owned resolvedResourceCache map", async () => {
    const dataPort = createInMemoryPort(new Map());
    const engine = new ResolveContentGraphEngine(
      dataPort,
      createExpansionPolicyChain([
        {
          matches: ({ resource }) => resource.equals(page),
          expand: () => ({ resources: [hero] }),
        },
        {
          matches: ({ resource }) => resource.equals(hero),
          expand: () => ({ resources: [] }),
        },
      ])
    );

    const pageValue = { title: "Cached page" };
    const heroValue = { title: "Cached hero" };
    const orphanKey = "orphan:O";
    const resolvedResourceCache = new Map<string, unknown>([
      [page.toString(), pageValue],
      [hero.toString(), heroValue],
      [orphanKey, { keep: true }],
    ]);

    const output = await engine.execute({
      root: page,
      executionContext: {},
      missingResourceMode: "throw",
      resolvedResourceCache,
    });

    expect(resolvedResourceCache.has(page.toString())).toBe(false);
    expect(resolvedResourceCache.has(hero.toString())).toBe(false);
    expect(resolvedResourceCache.get(orphanKey)).toEqual({ keep: true });
    expect(resolvedResourceCache.size).toBe(1);
    expect(output.contentMap.get(page)).toEqual(pageValue);
    expect(output.contentMap.get(hero)).toEqual(heroValue);
    expect(dataPort.process).not.toHaveBeenCalled();
  });

  it("aggregates inherited islands for the same missing resource", async () => {
    const left = testAri("branch", "L");
    const right = testAri("branch", "R");
    const store = new Map<string, unknown>([
      [page.toString(), {}],
      [left.toString(), {}],
      [right.toString(), {}],
    ]);
    const dataPort = createInMemoryPort(store);
    const engine = new ResolveContentGraphEngine(
      dataPort,
      createExpansionPolicyChain([
        {
          matches: ({ resource }) => resource.equals(page),
          expand: () => ({ resources: [left, right] }),
        },
        {
          matches: ({ resource }) => resource.type === "branch",
          expand: () => ({ resources: [missing], isIsland: true }),
        },
      ])
    );

    const output = await engine.execute({
      root: page,
      executionContext: {},
      missingResourceMode: "collect",
    });

    expect(output.errors).toHaveLength(1);
    expect(output.errors[0]?.resourceKey).toBe(missing.toString());
    expect(new Set(output.errors[0]?.inheritedIslandIds)).toEqual(
      new Set([left.toString(), right.toString()])
    );
    expect(
      dataPort.takenBatches.some((batch) => batch.some((resource) => resource.equals(missing)))
    ).toBe(true);
    const missingRequestCount = dataPort.takenBatches.filter((batch) =>
      batch.some((resource) => resource.equals(missing))
    ).length;
    expect(missingRequestCount).toBe(1);
  });

  it("throws when a port accepts no ARIs while unresolved work remains", async () => {
    const process = vi.fn(async (pull) => {
      expect(pull.take(() => false)).toEqual([]);
      return new Map();
    });

    const engine = new ResolveContentGraphEngine(
      { process },
      createExpansionPolicyChain([
        {
          matches: () => true,
          expand: () => ({ resources: [] }),
        },
      ])
    );

    await expect(
      engine.execute({
        root: page,
        executionContext: {},
        missingResourceMode: "throw",
      })
    ).rejects.toThrow(`Unable to resolve ${page.toString()}`);

    expect(process).toHaveBeenCalledTimes(1);
  });

  it("collects all unhandled resources when a port accepts no ARIs", async () => {
    const left = testAri("node", "L");
    const right = testAri("node", "R");
    const store = new Map<string, unknown>([[page.toString(), {}]]);
    let round = 0;

    const dataPort: DataResolutionPort = {
      async process(pull) {
        round += 1;
        if (round === 1) {
          const taken = pull.take(() => true);
          const result = new Map<string, unknown>();
          for (const resource of taken) {
            const key = resource.toString();
            if (store.has(key)) {
              result.set(key, store.get(key));
            }
          }
          return result;
        }

        expect(pull.take(() => false)).toEqual([]);
        return new Map();
      },
    };

    const engine = new ResolveContentGraphEngine(
      dataPort,
      createExpansionPolicyChain([
        {
          matches: ({ resource }) => resource.equals(page),
          expand: () => ({ resources: [left, right] }),
        },
        {
          matches: ({ resource }) => resource.type === "node",
          expand: () => ({ resources: [] }),
        },
      ])
    );

    const output = await engine.execute({
      root: page,
      executionContext: {},
      missingResourceMode: "collect",
    });

    expect(output.contentMap.has(page)).toBe(true);
    expect(output.contentMap.has(left)).toBe(false);
    expect(output.contentMap.has(right)).toBe(false);
    expect(output.errors).toHaveLength(2);
    expect(new Set(output.errors.map((error) => error.resourceKey))).toEqual(
      new Set([left.toString(), right.toString()])
    );
  });

  it("still defers leftovers when a capped port takes at least one resource", async () => {
    const takenBatches: ApplicationResourceIdentifier[][] = [];
    const store = new Map<string, unknown>([
      [page.toString(), {}],
      [hero.toString(), {}],
      [menu.toString(), {}],
    ]);

    const dataPort: DataResolutionPort = {
      async process(pull) {
        const taken = pull.take(() => true, 1);
        takenBatches.push(taken);
        const result = new Map<string, unknown>();
        for (const resource of taken) {
          const key = resource.toString();
          if (store.has(key)) {
            result.set(key, store.get(key));
          }
        }
        return result;
      },
    };

    const engine = new ResolveContentGraphEngine(
      dataPort,
      createExpansionPolicyChain([
        {
          matches: ({ resource }) => resource.equals(page),
          expand: () => ({ resources: [hero, menu] }),
        },
        {
          matches: ({ resource }) => resource.type === "hero" || resource.type === "menu",
          expand: () => ({ resources: [] }),
        },
      ])
    );

    const output = await engine.execute({
      root: page,
      executionContext: {},
      missingResourceMode: "throw",
    });

    expect(takenBatches[0]).toEqual([page]);
    expect(takenBatches[1]).toEqual([hero]);
    expect(takenBatches[2]).toEqual([menu]);
    expect(output.contentMap.has(hero)).toBe(true);
    expect(output.contentMap.has(menu)).toBe(true);
    expect(output.errors).toEqual([]);
  });

  it("resolves deep resource chains across many frontier rounds", async () => {
    const depth = 100;
    const nodes = Array.from({ length: depth }, (_, index) => testAri("node", String(index)));
    const indexByKey = new Map(nodes.map((resource, index) => [resource.toString(), index]));
    const store = new Map(nodes.map((resource) => [resource.toString(), {}] as const));

    const dataPort = createInMemoryPort(store);
    const engine = new ResolveContentGraphEngine(
      dataPort,
      createExpansionPolicyChain([
        {
          matches: ({ resource }) => resource.type === "node",
          expand: ({ resource }) => {
            const index = indexByKey.get(resource.toString());
            const next = index === undefined ? undefined : nodes[index + 1];
            return { resources: next === undefined ? [] : [next] };
          },
        },
      ])
    );

    const output = await engine.execute({
      root: nodes[0]!,
      executionContext: {},
      missingResourceMode: "throw",
    });

    expect(output.contentMap.has(nodes[0]!)).toBe(true);
    expect(output.contentMap.has(nodes[depth - 1]!)).toBe(true);
    expect(output.islands.get(nodes[0]!.toString()).size).toBe(depth);
    expect(dataPort.process).toHaveBeenCalledTimes(depth);
    expect(output.errors).toEqual([]);
  });

  it("records cyclic island dependencies without looping forever", async () => {
    const a = testAri("island", "A");
    const b = testAri("island", "B");
    const store = new Map<string, unknown>([
      [a.toString(), {}],
      [b.toString(), {}],
    ]);
    const dataPort = createInMemoryPort(store);

    const engine = new ResolveContentGraphEngine(
      dataPort,
      createExpansionPolicyChain([
        {
          matches: ({ resource }) => resource.equals(a),
          expand: () => ({ resources: [b], isIsland: true }),
        },
        {
          matches: ({ resource }) => resource.equals(b),
          expand: () => ({ resources: [a], isIsland: true }),
        },
      ])
    );

    const output = await engine.execute({
      root: a,
      executionContext: {},
      missingResourceMode: "throw",
    });

    expect(output.islandDependencies.get(a.toString())).toEqual(new Set([b.toString()]));
    expect(output.islandDependencies.get(b.toString())).toEqual(new Set([a.toString()]));
    expect(output.islandDependencies.getFlatDependencies(a.toString())).toEqual([b.toString()]);
    expect(output.islandDependencies.getFlatDependencies(b.toString())).toEqual([a.toString()]);
    expect(output.contentMap.has(a)).toBe(true);
    expect(output.contentMap.has(b)).toBe(true);
    expect(output.errors).toEqual([]);
  });
});
