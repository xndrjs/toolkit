import { describe, expect, it } from "vitest";

import { createResourceGraphResolver } from "./resource-graph-resolver";
import { createExpansionPolicyChain, type ExpansionPolicy } from "../ports/expansion-port";
import { serializeIsland } from "../islands/serialize-island";
import { createStoreSource } from "../testing/resolver-test-helpers";
import { footerAri, menuAri, pageAri, testAriFactory } from "../testing/test-fixtures";

/** Minimal graph: page -> menu/footer (islands); menu -> logo (island). */
const logoAri = testAriFactory("logo");

const page = pageAri({ id: "P" });
const menu = menuAri({ id: "M" });
const footer = footerAri({ id: "F" });
const logo = logoAri({ id: "L" });

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
    const resolver = createResourceGraphResolver({
      sources: [
        createStoreSource({
          families: { page: pageAri, menu: menuAri, footer: footerAri, logo: logoAri },
          store: values,
        }),
      ],
      expansion: createExpansionPolicyChain(createNestedIslandPolicies()),
      schedulingMode: "barrier",
    });

    const output = await resolver.resolve({
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
