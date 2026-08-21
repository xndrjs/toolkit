import { ari, type ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import { describe, expect, it, vi } from "vitest";

import type { DataResolutionPort } from "./data-resolution-port";
import { createExpansionPolicyChain, type ExpansionPolicy } from "./expansion-port";
import { ResolveContentTreeUseCase } from "./resolve-content-tree-use-case";
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

function createInMemoryPort(
  store: ReadonlyMap<string, unknown> = values
): DataResolutionPort & { resolve: ReturnType<typeof vi.fn> } {
  return {
    resolve: vi.fn(async (resources: readonly ApplicationResourceIdentifier[]) => {
      const result = new Map<string, unknown>();
      for (const resource of resources) {
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
      matches: (resource) => resource.type === "page",
      expand: () => ({ resources: [hero, menu, footer] }),
    },
    {
      matches: (resource) => resource.type === "hero",
      expand: () => ({ resources: [asset] }),
    },
    {
      matches: (resource) => resource.type === "menu",
      expand: () => ({ resources: [asset], isIsland: true }),
    },
    {
      matches: (resource) => resource.type === "footer",
      expand: () => ({ resources: [asset], isIsland: true }),
    },
    {
      matches: (resource) => resource.type === "asset",
      expand: () => ({ resources: [] }),
    },
  ];
}

describe("ResolveContentTreeUseCase", () => {
  it("batches the data port per frontier, shares ContentMap keys, and isolates menu/footer islands", async () => {
    const dataPort = createInMemoryPort();
    const useCase = new ResolveContentTreeUseCase(
      dataPort,
      createExpansionPolicyChain(createPageGraphPolicies())
    );

    const output = await useCase.execute({
      root: page,
      context: {},
      missingResourceMode: "throw",
    });

    // Port is called once per frontier batch, not per node
    expect(dataPort.resolve).toHaveBeenCalledTimes(3);
    expect(dataPort.resolve.mock.calls.map((call) => call[0])).toEqual([
      [page],
      [hero, menu, footer],
      [asset],
    ]);

    // asset:A is requested only once even though it belongs to multiple islands
    const assetRequestCount = dataPort.resolve.mock.calls.filter((call) =>
      call[0].some((resource: ApplicationResourceIdentifier) => resource.equals(asset))
    ).length;
    expect(assetRequestCount).toBe(1);

    // ContentMap keeps a single instance per resource key
    const assetValue = output.contentMap.get(asset);
    expect(assetValue).toEqual({ url: "https://cdn.example.com/logo.svg" });
    expect(output.contentMap.getByKey(asset.format())).toBe(assetValue);

    // Islands share the same resource key (membership), not nested copies
    expect(output.islands.get(page.format())).toEqual(
      new Set([page.format(), hero.format(), asset.format()])
    );
    expect(output.islands.get(menu.format())).toEqual(new Set([menu.format(), asset.format()]));
    expect(output.islands.get(footer.format())).toEqual(new Set([footer.format(), asset.format()]));

    // menu / footer with isIsland: true → autonomous islands + dependencies from page
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

  it("terminates graph cycles via visited (island, resource) pairs", async () => {
    const a = ari("node", { id: "A" });
    const b = ari("node", { id: "B" });
    const store = new Map<string, unknown>([
      [a.format(), { next: b.format() }],
      [b.format(), { next: a.format() }],
    ]);
    const dataPort = createInMemoryPort(store);
    const useCase = new ResolveContentTreeUseCase(
      dataPort,
      createExpansionPolicyChain([
        {
          matches: () => true,
          expand: ({ resource, contentMap }) => {
            const value = contentMap.get<{ next: string }>(resource);
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

    const output = await useCase.execute({
      root: a,
      context: {},
      missingResourceMode: "throw",
    });

    expect(output.islands.get(a.format())).toEqual(new Set([a.format(), b.format()]));
    expect(dataPort.resolve).toHaveBeenCalledTimes(2);
  });

  it("collect mode does not throw, skips missing serialization, and marks islands partial", async () => {
    const store = new Map(values);
    store.delete(menu.format());

    const dataPort = createInMemoryPort(store);
    const useCase = new ResolveContentTreeUseCase(
      dataPort,
      createExpansionPolicyChain(createPageGraphPolicies())
    );

    const output = await useCase.execute({
      root: page,
      context: {},
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
    const useCase = new ResolveContentTreeUseCase(
      dataPort,
      createExpansionPolicyChain(createPageGraphPolicies())
    );

    await expect(
      useCase.execute({
        root: page,
        context: {},
        missingResourceMode: "throw",
      })
    ).rejects.toThrow(`Unable to resolve ${hero.format()}`);
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
    const useCase = new ResolveContentTreeUseCase(
      dataPort,
      createExpansionPolicyChain([
        {
          matches: (resource) => resource.equals(page),
          expand: () => ({ resources: [left, right] }),
        },
        {
          matches: (resource) => resource.type === "branch",
          expand: () => ({ resources: [missing], isIsland: true }),
        },
      ])
    );

    const output = await useCase.execute({
      root: page,
      context: {},
      missingResourceMode: "collect",
    });

    expect(output.errors).toHaveLength(1);
    expect(output.errors[0]?.resourceKey).toBe(missing.format());
    expect(new Set(output.errors[0]?.inheritedIslandIds)).toEqual(
      new Set([left.format(), right.format()])
    );
    expect(
      dataPort.resolve.mock.calls.some((call) =>
        call[0].some((resource: ApplicationResourceIdentifier) => resource.equals(missing))
      )
    ).toBe(true);
    // Missing resource is not requested again after failure registration
    const missingRequestCount = dataPort.resolve.mock.calls.filter((call) =>
      call[0].some((resource: ApplicationResourceIdentifier) => resource.equals(missing))
    ).length;
    expect(missingRequestCount).toBe(1);
  });
});
