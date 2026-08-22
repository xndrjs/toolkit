import { ResolveContentGraphEngine, serializeAllIslands } from "@xndrjs/resource-graph-resolver";
import { describe, expect, it } from "vitest";

import { createCmsDataLoader, demoCmsStore, logoAssetAri, pageEntryAri } from "./cms/index.js";
import { createDemoDataGateway } from "./demo-data-gateway.js";
import { createDemoExpansionPort } from "./expansion-policies.js";
import { createIntegrationDataLoader, tshirtIntegrationAri } from "./integration/index.js";

describe("serializeAllIslands", () => {
  it("materializes every resolved island with cache-ready payloads", async () => {
    const engine = new ResolveContentGraphEngine(
      createDemoDataGateway(createCmsDataLoader(demoCmsStore), createIntegrationDataLoader()),
      createDemoExpansionPort()
    );

    const result = await engine.execute({
      root: pageEntryAri,
      context: undefined,
      missingResourceMode: "throw",
    });

    const serializedIslands = serializeAllIslands(result);

    expect(serializedIslands).toHaveLength(3);
    expect(serializedIslands.every((island) => island.completeness === "complete")).toBe(true);
    expect(serializedIslands.every((island) => Object.keys(island.resources).length > 0)).toBe(
      true
    );

    const pageIsland = serializedIslands.find(
      (island) => island.islandId === pageEntryAri.format()
    );
    expect(pageIsland?.resources[pageEntryAri.format()]).toBeDefined();
    expect(pageIsland?.resources[tshirtIntegrationAri.format()]).toBeDefined();

    const islandsWithLogo = serializedIslands.filter(
      (island) => island.resources[logoAssetAri.format()] !== undefined
    );
    expect(islandsWithLogo.length).toBeGreaterThanOrEqual(2);
  });
});
