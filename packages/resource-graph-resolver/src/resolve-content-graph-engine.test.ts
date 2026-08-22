import { ari, type ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import { describe, expect, it, vi } from "vitest";

import type { DataResolutionPort } from "./data-resolution-port";
import { createExpansionPolicyChain, type ExpansionPolicy } from "./expansion-port";
import { ResolveContentGraphEngine } from "./resolve-content-graph-engine";
import { serializeIsland } from "./serialize-island";

const page = ari("page", { id: "P" });
const hero = ari("hero", { id: "H" });
const menu = ari("menu", { id: "M" });
const footer = ari("footer", { id: "F" });
const asset = ari("asset", { id: "A" });
const missing = ari("missing", { id: "X" });

const values = new Map<string, unknown>([
  [
    page.format(),
    {
      title: "Homepage",
      hero: { $ref: hero.format() },
      menu: { $ref: menu.format() },
      footer: { $ref: footer.format() },
    },
  ],
  [hero.format(), { image: { $ref: asset.format() } }],
  [menu.format(), { logo: { $ref: asset.format() } }],
  [footer.format(), { logo: { $ref: asset.format() } }],
  [asset.format(), { url: "https://cdn.example.com/logo.svg" }],
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
        const key = resource.format();
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
    expect(output.contentMap.getByKey(asset.format())).toBe(assetValue);

    expect(output.islands.get(page.format())).toEqual(
      new Set([page.format(), hero.format(), asset.format()])
    );
    expect(output.islands.get(menu.format())).toEqual(new Set([menu.format(), asset.format()]));
    expect(output.islands.get(footer.format())).toEqual(new Set([footer.format(), asset.format()]));

    expect(output.islandDependencies.get(page.format())).toEqual(
      new Set([menu.format(), footer.format()])
    );
    expect(output.islandDependencies.get(menu.format()).size).toBe(0);
    expect(output.islandDependencies.get(footer.format()).size).toBe(0);
    expect(output.errors).toEqual([]);

    const pageSerialized = serializeIsland(page.format(), output);
    const menuSerialized = serializeIsland(menu.format(), output);
    const footerSerialized = serializeIsland(footer.format(), output);

    expect(pageSerialized.resources[asset.format()]).toBe(assetValue);
    expect(menuSerialized.resources[asset.format()]).toBe(assetValue);
    expect(footerSerialized.resources[asset.format()]).toBe(assetValue);
    expect(pageSerialized.resources[menu.format()]).toBeUndefined();
    expect(pageSerialized.resources[footer.format()]).toBeUndefined();
    expect(pageSerialized.dependencies).toEqual(
      expect.arrayContaining([menu.format(), footer.format()])
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
          const key = resource.format();
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

    const a = ari("node", { id: "A" });
    const b = ari("node", { id: "B" });
    const store = new Map<string, CycleRegistry["node"]>([
      [a.format(), { next: b.format() }],
      [b.format(), { next: a.format() }],
    ]);
    const dataPort = {
      takenBatches: [] as ApplicationResourceIdentifier[][],
      process: vi.fn(async (pull) => {
        const taken = pull.take(() => true);
        dataPort.takenBatches.push(taken);
        const result = new Map<string, CycleRegistry["node"]>();
        for (const resource of taken) {
          const key = resource.format();
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
            if (childKey === b.format()) {
              return { resources: [b] };
            }
            if (childKey === a.format()) {
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

    expect(output.islands.get(a.format())).toEqual(new Set([a.format(), b.format()]));
    expect(dataPort.process).toHaveBeenCalledTimes(2);
  });

  it("collect mode does not throw, skips missing serialization, and marks islands partial", async () => {
    const store = new Map(values);
    store.delete(menu.format());

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
    expect(output.islands.get(menu.format()).size).toBe(0);
    expect(output.errors).toHaveLength(1);
    expect(output.errors[0]?.resourceKey).toBe(menu.format());
    expect(output.errors[0]?.inheritedIslandIds).toEqual([page.format()]);
    expect(output.islands.get(page.format())).toEqual(
      new Set([page.format(), hero.format(), asset.format()])
    );
    expect(output.islandDependencies.get(page.format())).toEqual(new Set([footer.format()]));

    const pageSerialized = serializeIsland(page.format(), output);
    expect(pageSerialized.completeness).toBe("partial");
    expect(pageSerialized.missingResources).toEqual([menu.format()]);
    expect(pageSerialized.resources[menu.format()]).toBeUndefined();
    expect(pageSerialized.dependencies).toEqual([footer.format()]);

    const footerSerialized = serializeIsland(footer.format(), output);
    expect(footerSerialized.completeness).toBe("complete");
    expect(footerSerialized.missingResources).toEqual([]);
  });

  it("throws on the first missing resource in throw mode", async () => {
    const store = new Map(values);
    store.delete(hero.format());

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
    ).rejects.toThrow(`Unable to resolve ${hero.format()}`);
  });

  it("promotes resolvedResourceCache hits into ContentMap and skips DataResolutionPort pulls", async () => {
    const dataPort = createInMemoryPort();
    const engine = new ResolveContentGraphEngine(
      dataPort,
      createExpansionPolicyChain(createPageGraphPolicies())
    );

    const cachedAsset = { url: "https://cdn.example.com/from-cache.svg" };
    const resolvedResourceCache = new Map<string, unknown>([
      [page.format(), values.get(page.format())],
      [hero.format(), values.get(hero.format())],
      [menu.format(), values.get(menu.format())],
      [footer.format(), values.get(footer.format())],
      [asset.format(), cachedAsset],
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

    const orphan = ari("orphan", { id: "O" });
    const orphanValue = { label: "never reached" };
    const resolvedResourceCache = new Map<string, unknown>([[orphan.format(), orphanValue]]);

    const output = await engine.execute({
      root: page,
      executionContext: {},
      missingResourceMode: "throw",
      resolvedResourceCache,
    });

    expect(output.contentMap.has(orphan)).toBe(false);
    expect(output.contentMap.getByKey(orphan.format())).toBeUndefined();
    expect(resolvedResourceCache.get(orphan.format())).toBe(orphanValue);
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
      [page.format(), pageValue],
      [hero.format(), heroValue],
      [orphanKey, { keep: true }],
    ]);

    const output = await engine.execute({
      root: page,
      executionContext: {},
      missingResourceMode: "throw",
      resolvedResourceCache,
    });

    expect(resolvedResourceCache.has(page.format())).toBe(false);
    expect(resolvedResourceCache.has(hero.format())).toBe(false);
    expect(resolvedResourceCache.get(orphanKey)).toEqual({ keep: true });
    expect(resolvedResourceCache.size).toBe(1);
    expect(output.contentMap.get(page)).toEqual(pageValue);
    expect(output.contentMap.get(hero)).toEqual(heroValue);
    expect(dataPort.process).not.toHaveBeenCalled();
  });

  it("aggregates inherited islands for the same missing resource", async () => {
    const left = ari("branch", { id: "L" });
    const right = ari("branch", { id: "R" });
    const store = new Map<string, unknown>([
      [page.format(), {}],
      [left.format(), {}],
      [right.format(), {}],
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
    expect(output.errors[0]?.resourceKey).toBe(missing.format());
    expect(new Set(output.errors[0]?.inheritedIslandIds)).toEqual(
      new Set([left.format(), right.format()])
    );
    expect(
      dataPort.takenBatches.some((batch) => batch.some((resource) => resource.equals(missing)))
    ).toBe(true);
    const missingRequestCount = dataPort.takenBatches.filter((batch) =>
      batch.some((resource) => resource.equals(missing))
    ).length;
    expect(missingRequestCount).toBe(1);
  });
});
