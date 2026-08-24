import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import { describe, expect, it, vi } from "vitest";

import {
  asset,
  createSemanticHarness,
  footer,
  hero,
  menu,
  missing,
  page,
  pageGraphValues,
  type EngineKind,
} from "../testing/content-graph-engine-test-helpers";
import { serializeIsland } from "../islands/serialize-island";
import { testAri } from "../testing/test-fixtures.js";
import type { ResolvedResourceRecord } from "../types";

const engineKinds: EngineKind[] = ["barrier", "lane"];

describe.each(engineKinds)("content graph semantic contract (%s)", (kind) => {
  it("shares ContentMap keys and isolates menu/footer islands", async () => {
    const { engine, process, takenBatches } = createSemanticHarness(kind);

    const output = await engine.execute({
      root: page,
      executionContext: {},
      missingResourceMode: "throw",
    });

    expect(process).toHaveBeenCalledTimes(3);
    expect(takenBatches).toEqual([[page], [hero, menu, footer], [asset]]);

    const assetRequestCount = takenBatches.filter((batch) =>
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

  it("re-queues deferred resources so a capped loader can saturate later batches", async () => {
    const { engine, takenBatches } = createSemanticHarness(kind, { takeLimit: 1 });

    const output = await engine.execute({
      root: page,
      executionContext: {},
      missingResourceMode: "throw",
    });

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

    const takenBatches: ApplicationResourceIdentifier[][] = [];
    const { engine, process } = createSemanticHarness(kind, {
      store,
      policies: [
        {
          matches: () => true,
          expand: ({ payload }) => {
            const value = payload as CycleRegistry["node"];
            const childKey = value.next;
            if (childKey === b.toString()) {
              return { resources: [b] };
            }
            if (childKey === a.toString()) {
              return { resources: [a] };
            }
            return { resources: [] };
          },
        },
      ],
      process: async (pull) => {
        const taken = pull.take(() => true);
        takenBatches.push(taken);
        const result: ResolvedResourceRecord<Record<string, unknown>>[] = [];
        for (const resource of taken) {
          const key = resource.toString();
          if (store.has(key)) {
            result.push({ resource, payload: store.get(key)! });
          }
        }
        return result;
      },
    });

    const output = await engine.execute({
      root: a,
      executionContext: {},
      missingResourceMode: "throw",
    });

    expect(output.islands.get(a.toString())).toEqual(new Set([a.toString(), b.toString()]));
    expect(process).toHaveBeenCalledTimes(2);
  });

  it("collect mode does not throw, skips missing serialization, and marks islands partial", async () => {
    const store = new Map(pageGraphValues);
    store.delete(menu.toString());

    const { engine } = createSemanticHarness(kind, { store });

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
    const store = new Map(pageGraphValues);
    store.delete(hero.toString());

    const { engine } = createSemanticHarness(kind, { store });

    await expect(
      engine.execute({
        root: page,
        executionContext: {},
        missingResourceMode: "throw",
      })
    ).rejects.toThrow(`Unable to resolve ${hero.toString()}`);
  });

  it("promotes backingResources hits into ContentMap and skips loader pulls", async () => {
    const { engine, process, takenBatches } = createSemanticHarness(kind);

    const cachedAsset = { url: "https://cdn.example.com/from-cache.svg" };
    const backingResources = new Map<string, unknown>([
      [page.toString(), pageGraphValues.get(page.toString())],
      [hero.toString(), pageGraphValues.get(hero.toString())],
      [menu.toString(), pageGraphValues.get(menu.toString())],
      [footer.toString(), pageGraphValues.get(footer.toString())],
      [asset.toString(), cachedAsset],
    ]);

    const output = await engine.execute({
      root: page,
      executionContext: {},
      missingResourceMode: "throw",
      backingResources,
    });

    expect(process).not.toHaveBeenCalled();
    expect(takenBatches).toEqual([]);
    expect(output.contentMap.get(asset)).toEqual(cachedAsset);
    expect(output.contentMap.has(page)).toBe(true);
    expect(output.contentMap.has(hero)).toBe(true);
    expect(output.contentMap.has(menu)).toBe(true);
    expect(output.contentMap.has(footer)).toBe(true);
    expect(backingResources.size).toBe(0);
    expect(output.errors).toEqual([]);
  });

  it("does not put unreached backingResources entries into ContentMap", async () => {
    const { engine } = createSemanticHarness(kind);

    const orphan = testAri("orphan", "O");
    const orphanValue = { label: "never reached" };
    const backingResources = new Map<string, unknown>([[orphan.toString(), orphanValue]]);

    const output = await engine.execute({
      root: page,
      executionContext: {},
      missingResourceMode: "throw",
      backingResources,
    });

    expect(output.contentMap.has(orphan)).toBe(false);
    expect(output.contentMap.getByKey(orphan.toString())).toBeUndefined();
    expect(backingResources.get(orphan.toString())).toBe(orphanValue);
    expect(output.contentMap.has(page)).toBe(true);
    expect(output.contentMap.has(asset)).toBe(true);
  });

  it("deletes promoted keys from the caller-owned backingResources map", async () => {
    const { engine, process } = createSemanticHarness(kind, {
      store: new Map(),
      policies: [
        {
          matches: ({ resource }) => resource.equals(page),
          expand: () => ({ resources: [hero] }),
        },
        {
          matches: ({ resource }) => resource.equals(hero),
          expand: () => ({ resources: [] }),
        },
      ],
    });

    const pageValue = { title: "Cached page" };
    const heroValue = { title: "Cached hero" };
    const orphanKey = "orphan:O";
    const backingResources = new Map<string, unknown>([
      [page.toString(), pageValue],
      [hero.toString(), heroValue],
      [orphanKey, { keep: true }],
    ]);

    const output = await engine.execute({
      root: page,
      executionContext: {},
      missingResourceMode: "throw",
      backingResources,
    });

    expect(backingResources.has(page.toString())).toBe(false);
    expect(backingResources.has(hero.toString())).toBe(false);
    expect(backingResources.get(orphanKey)).toEqual({ keep: true });
    expect(backingResources.size).toBe(1);
    expect(output.contentMap.get(page)).toEqual(pageValue);
    expect(output.contentMap.get(hero)).toEqual(heroValue);
    expect(process).not.toHaveBeenCalled();
  });

  it("aggregates inherited islands for the same missing resource", async () => {
    const left = testAri("branch", "L");
    const right = testAri("branch", "R");
    const store = new Map<string, unknown>([
      [page.toString(), {}],
      [left.toString(), {}],
      [right.toString(), {}],
    ]);

    const { engine, takenBatches } = createSemanticHarness(kind, {
      store,
      policies: [
        {
          matches: ({ resource }) => resource.equals(page),
          // Intentionally inverted to prove engine sorts inherited island IDs.
          expand: () => ({ resources: [right, left] }),
        },
        {
          matches: ({ resource }) => resource.type === "branch",
          expand: () => ({ resources: [missing], isIsland: true }),
        },
      ],
    });

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
    expect(output.errors[0]?.inheritedIslandIds).toEqual(
      [left.toString(), right.toString()].sort()
    );
    expect(takenBatches.some((batch) => batch.some((resource) => resource.equals(missing)))).toBe(
      true
    );
    const missingRequestCount = takenBatches.filter((batch) =>
      batch.some((resource) => resource.equals(missing))
    ).length;
    expect(missingRequestCount).toBe(1);
  });

  it("throws when a loader accepts no ARIs while unresolved work remains", async () => {
    const process = vi.fn(async (pull) => {
      expect(pull.take(() => false)).toEqual([]);
      return [];
    });

    const { engine } = createSemanticHarness(kind, {
      process,
      policies: [
        {
          matches: () => true,
          expand: () => ({ resources: [] }),
        },
      ],
    });

    await expect(
      engine.execute({
        root: page,
        executionContext: {},
        missingResourceMode: "throw",
      })
    ).rejects.toThrow(`Unable to resolve ${page.toString()}`);

    expect(process).toHaveBeenCalledTimes(1);
  });

  it("collects all unhandled resources when a loader accepts no ARIs", async () => {
    const left = testAri("node", "L");
    const right = testAri("node", "R");
    const store = new Map<string, unknown>([[page.toString(), {}]]);
    let round = 0;

    const { engine } = createSemanticHarness(kind, {
      process: async (pull) => {
        round += 1;
        if (round === 1) {
          const taken = pull.take(() => true);
          const result: ResolvedResourceRecord<Record<string, unknown>>[] = [];
          for (const resource of taken) {
            const key = resource.toString();
            if (store.has(key)) {
              result.push({ resource, payload: store.get(key) });
            }
          }
          return result;
        }

        expect(pull.take(() => false)).toEqual([]);
        return [];
      },
      policies: [
        {
          matches: ({ resource }) => resource.equals(page),
          expand: () => ({ resources: [left, right] }),
        },
        {
          matches: ({ resource }) => resource.type === "node",
          expand: () => ({ resources: [] }),
        },
      ],
    });

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
    expect(output.errors.map((error) => error.resourceKey)).toEqual(
      [left.toString(), right.toString()].sort()
    );
  });

  it("still defers leftovers when a capped loader takes at least one resource", async () => {
    const store = new Map<string, unknown>([
      [page.toString(), {}],
      [hero.toString(), {}],
      [menu.toString(), {}],
    ]);

    const { engine, takenBatches } = createSemanticHarness(kind, {
      store,
      takeLimit: 1,
      policies: [
        {
          matches: ({ resource }) => resource.equals(page),
          expand: () => ({ resources: [hero, menu] }),
        },
        {
          matches: ({ resource }) => resource.type === "hero" || resource.type === "menu",
          expand: () => ({ resources: [] }),
        },
      ],
    });

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

  it("resolves deep resource chains across many frontier batches", async () => {
    const depth = 100;
    const nodes = Array.from({ length: depth }, (_, index) => testAri("node", String(index)));
    const indexByKey = new Map(nodes.map((resource, index) => [resource.toString(), index]));
    const store = new Map(nodes.map((resource) => [resource.toString(), {}] as const));

    const { engine, process } = createSemanticHarness(kind, {
      store,
      policies: [
        {
          matches: ({ resource }) => resource.type === "node",
          expand: ({ resource }) => {
            const index = indexByKey.get(resource.toString());
            const next = index === undefined ? undefined : nodes[index + 1];
            return { resources: next === undefined ? [] : [next] };
          },
        },
      ],
    });

    const output = await engine.execute({
      root: nodes[0]!,
      executionContext: {},
      missingResourceMode: "throw",
    });

    expect(output.contentMap.has(nodes[0]!)).toBe(true);
    expect(output.contentMap.has(nodes[depth - 1]!)).toBe(true);
    expect(output.islands.get(nodes[0]!.toString()).size).toBe(depth);
    expect(process).toHaveBeenCalledTimes(depth);
    expect(output.errors).toEqual([]);
  });

  it("records cyclic island dependencies without looping forever", async () => {
    const a = testAri("island", "A");
    const b = testAri("island", "B");
    const store = new Map<string, unknown>([
      [a.toString(), {}],
      [b.toString(), {}],
    ]);

    const { engine } = createSemanticHarness(kind, {
      store,
      policies: [
        {
          matches: ({ resource }) => resource.equals(a),
          expand: () => ({ resources: [b], isIsland: true }),
        },
        {
          matches: ({ resource }) => resource.equals(b),
          expand: () => ({ resources: [a], isIsland: true }),
        },
      ],
    });

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

  it("propagates AbortSignal on the loader pull and aborts independently of missingResourceMode", async () => {
    const controller = new AbortController();
    const process = vi.fn(async (pull) => {
      expect(pull.signal).toBe(controller.signal);
      controller.abort("stop");
      return [];
    });

    const { engine } = createSemanticHarness(kind, {
      process,
      policies: [
        {
          matches: () => true,
          expand: () => ({ resources: [] }),
        },
      ],
    });

    await expect(
      engine.execute({
        root: page,
        executionContext: {},
        missingResourceMode: "collect",
        signal: controller.signal,
      })
    ).rejects.toMatchObject({
      name: "ResolveContentGraphAbortedError",
      cause: "stop",
    });

    expect(process).toHaveBeenCalledTimes(1);
  });

  it("throws when already aborted before the first batch", async () => {
    const controller = new AbortController();
    controller.abort();
    const process = vi.fn(async () => []);

    const { engine } = createSemanticHarness(kind, {
      process,
      policies: [
        {
          matches: () => true,
          expand: () => ({ resources: [] }),
        },
      ],
    });

    await expect(
      engine.execute({
        root: page,
        executionContext: {},
        missingResourceMode: "collect",
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: "ResolveContentGraphAbortedError" });

    expect(process).not.toHaveBeenCalled();
  });
});
