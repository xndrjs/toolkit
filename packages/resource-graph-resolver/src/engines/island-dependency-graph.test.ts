import { describe, expect, it, vi } from "vitest";

import type { DataResolutionPort } from "../ports/data-resolution-port";
import { createExpansionPolicyChain, type ExpansionPolicy } from "../ports/expansion-port";
import { BarrierResolveContentGraphEngine } from "./barrier-resolve-content-graph-engine";
import { serializeIsland } from "../islands/serialize-island";
import { testAri } from "../testing/test-fixtures.js";
import type { ResolvedResourceRecord } from "../types";

/** Minimal graph: page → menu/footer (islands); menu → logo (island). */
const page = testAri("page", "P");
const menu = testAri("menu", "M");
const footer = testAri("footer", "F");
const logo = testAri("logo", "L");

const values = new Map<string, unknown>([
  [
    page.toString(),
    {
      title: "Homepage",
      menu: { $ref: menu.toString() },
      footer: { $ref: footer.toString() },
    },
  ],
  [menu.toString(), { logo: { $ref: logo.toString() } }],
  [footer.toString(), { label: "Footer" }],
  [logo.toString(), { url: "https://cdn.example.com/logo.svg" }],
]);

function createInMemoryPort(store: ReadonlyMap<string, unknown> = values): DataResolutionPort {
  return {
    process: vi.fn(async (pull) => {
      const taken = pull.take(() => true);
      const result: ResolvedResourceRecord<Record<string, unknown>>[] = [];
      for (const resource of taken) {
        const key = resource.toString();
        if (store.has(key)) {
          result.push({ resource, payload: store.get(key) });
        }
      }
      return result;
    }),
  };
}

function createNestedIslandPolicies(): ExpansionPolicy[] {
  return [
    {
      matches: ({ resource }) => resource.type === "page",
      expand: () => ({ resources: [menu, footer] }),
    },
    {
      matches: ({ resource }) => resource.type === "menu",
      expand: () => ({ resources: [logo], isIsland: true }),
    },
    {
      matches: ({ resource }) => resource.type === "footer",
      expand: () => ({ resources: [], isIsland: true }),
    },
    {
      matches: ({ resource }) => resource.type === "logo",
      expand: () => ({ resources: [], isIsland: true }),
    },
  ];
}

describe("island dependency graph", () => {
  it("records direct island edges only — nested logo island is not a page dependency", async () => {
    const engine = new BarrierResolveContentGraphEngine(
      createInMemoryPort(),
      createExpansionPolicyChain(createNestedIslandPolicies())
    );

    const output = await engine.execute({
      root: page,
      executionContext: {},
      missingResourceMode: "throw",
    });

    const pageDeps = [...output.islandDependencies.get(page.toString())].sort();
    const menuDeps = [...output.islandDependencies.get(menu.toString())].sort();
    const footerDeps = [...output.islandDependencies.get(footer.toString())].sort();
    const logoDeps = [...output.islandDependencies.get(logo.toString())].sort();

    expect(pageDeps).toEqual([footer.toString(), menu.toString()].sort());
    expect(pageDeps).not.toContain(logo.toString());
    expect(menuDeps).toEqual([logo.toString()]);
    expect(footerDeps).toEqual([]);
    expect(logoDeps).toEqual([]);

    expect(output.islands.get(page.toString())).toEqual(new Set([page.toString()]));
    expect(output.islands.get(menu.toString())).toEqual(new Set([menu.toString()]));
    expect(output.islands.get(footer.toString())).toEqual(new Set([footer.toString()]));
    expect(output.islands.get(logo.toString())).toEqual(new Set([logo.toString()]));

    const serializedPage = serializeIsland(page.toString(), output);
    const serializedMenu = serializeIsland(menu.toString(), output);
    const serializedLogo = serializeIsland(logo.toString(), output);

    expect(serializedPage.dependencies.sort()).toEqual(pageDeps);
    expect(serializedPage.dependencies).not.toContain(logo.toString());
    expect(serializedMenu.dependencies).toEqual([logo.toString()]);
    expect(serializedLogo.dependencies).toEqual([]);
    expect(serializedPage.resources[logo.toString()]).toBeUndefined();
    expect(serializedMenu.resources[logo.toString()]).toBeUndefined();
    expect(serializedLogo.resources[logo.toString()]).toEqual({
      url: "https://cdn.example.com/logo.svg",
    });
  });
});
