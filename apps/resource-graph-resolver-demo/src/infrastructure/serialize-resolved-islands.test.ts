import {
  BarrierResolveContentGraphEngine,
  serializeAllIslands,
} from "@xndrjs/resource-graph-resolver";
import { describe, expect, it } from "vitest";

import {
  createCmsDataLoader,
  cmsEntryAri,
  demoCmsStore,
  demoIds,
  logoAssetAri,
} from "./cms/index.js";
import { createDemoDataGateway } from "./demo-data-gateway.js";
import { createDefaultDemoExecutionContext } from "./demo-execution-context.js";
import { createDemoExpansionPort } from "./expansion-policies.js";
import { createIntegrationDataLoader, tshirtIntegrationAri } from "./integration/index.js";

describe("serializeAllIslands", () => {
  it("materializes every resolved island with cache-ready payloads", async () => {
    const executionContext = createDefaultDemoExecutionContext();
    const pageRoot = cmsEntryAri({ id: demoIds.page, locale: executionContext.locale });

    const engine = new BarrierResolveContentGraphEngine(
      createDemoDataGateway(createCmsDataLoader(demoCmsStore), createIntegrationDataLoader()),
      createDemoExpansionPort()
    );

    const result = await engine.execute({
      root: pageRoot,
      executionContext,
      missingResourceMode: "throw",
    });

    const serializedIslands = serializeAllIslands(result);

    expect(serializedIslands).toHaveLength(3);
    expect(serializedIslands.every((island) => island.completeness === "complete")).toBe(true);
    expect(serializedIslands.every((island) => Object.keys(island.resources).length > 0)).toBe(
      true
    );

    const pageIsland = serializedIslands.find((island) => island.islandId === pageRoot.toString());
    expect(pageIsland?.resources[pageRoot.toString()]).toBeDefined();
    expect(pageIsland?.resources[tshirtIntegrationAri.toString()]).toBeDefined();

    const islandsWithLogo = serializedIslands.filter(
      (island) => island.resources[logoAssetAri.toString()] !== undefined
    );
    expect(islandsWithLogo.length).toBeGreaterThanOrEqual(2);
  });
});
