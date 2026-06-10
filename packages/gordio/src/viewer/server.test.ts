import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { ArchitectureGraphDocument } from "../config/define-config";
import { startViewerServer } from "./server";

let fixtureDirs: string[] = [];

afterEach(async () => {
  await Promise.all(fixtureDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  fixtureDirs = [];
});

const graphDocument: ArchitectureGraphDocument = {
  version: 1,
  graph: {
    boxes: [
      { id: "app:web", kind: "app", title: "Web", laneId: "apps" },
      { id: "pkg:catalog", kind: "core-package", title: "Catalog", laneId: "core" },
      { id: "pkg:orders", kind: "core-package", title: "Orders", laneId: "core" },
      {
        id: "pkg:orders-infra",
        kind: "infrastructure-package",
        title: "Orders Infrastructure",
        laneId: "infrastructure",
      },
    ],
    nodes: [
      {
        id: "app:web:composition-root",
        kind: "composition-root",
        title: "WebCompositionRoot",
        boxId: "app:web",
      },
      {
        id: "core:catalog:product",
        kind: "model",
        title: "Product",
        boxId: "pkg:catalog",
      },
      {
        id: "core:catalog:publish-product",
        kind: "capability",
        title: "PublishProduct",
        boxId: "pkg:catalog",
      },
      {
        id: "core:catalog:publish-catalog-item",
        kind: "use-case",
        title: "PublishCatalogItem",
        boxId: "pkg:catalog",
      },
      {
        id: "core:catalog:product-repository",
        kind: "port",
        title: "ProductRepository",
        boxId: "pkg:catalog",
      },
      {
        id: "core:orders:submit-order",
        kind: "capability",
        title: "SubmitOrder",
        boxId: "pkg:orders",
      },
      {
        id: "core:orders:order-repository",
        kind: "port",
        title: "OrderRepository",
        boxId: "pkg:orders",
      },
      {
        id: "infra:orders:sql-order-repository",
        kind: "repository",
        title: "SqlOrderRepository",
        boxId: "pkg:orders-infra",
      },
    ],
    edges: [],
  },
};

describe("startViewerServer", () => {
  it("serves the viewer shell, graph document, and React Flow projection", async () => {
    const assetRoot = await createAssetFixture();
    const server = await startViewerServer({ document: graphDocument, assetRoot, port: 0 });

    try {
      const [htmlResponse, scriptResponse, styleResponse, graphResponse, projectionResponse] =
        await Promise.all([
          fetch(server.url),
          fetch(new URL("/assets/viewer.js", server.url)),
          fetch(new URL("/assets/viewer.css", server.url)),
          fetch(new URL("/graph.json", server.url)),
          fetch(new URL("/projection.json", server.url)),
        ]);

      await expect(htmlResponse.text()).resolves.toContain("/assets/viewer.js");
      await expect(scriptResponse.text()).resolves.toContain("viewer script");
      await expect(styleResponse.text()).resolves.toContain("viewer style");
      await expect(graphResponse.json()).resolves.toEqual(graphDocument);

      const projection = await projectionResponse.json();
      const nodeById = new Map(projection.nodes.map((node: { id: string }) => [node.id, node]));

      expect(nodeById.get("app:web")).toMatchObject({
        type: "architectureBox",
        position: { x: 64, y: 80 },
      });
      expect(nodeById.get("pkg:catalog")).toMatchObject({
        type: "architectureBox",
        data: { width: 1120 },
        position: { x: 448, y: 80 },
      });
      expect(nodeById.get("pkg:orders")).toMatchObject({
        type: "architectureBox",
        data: { width: 1120 },
        position: { x: 448, y: 340 },
      });
      expect(nodeById.get("pkg:orders-infra")).toMatchObject({
        type: "architectureBox",
        position: { x: 1648, y: 80 },
      });
      expect(nodeById.get("core:catalog:product")).toMatchObject({
        parentId: "pkg:catalog",
        position: { x: 24, y: 76 },
      });
      expect(nodeById.get("core:catalog:publish-product")).toMatchObject({
        parentId: "pkg:catalog",
        position: { x: 304, y: 76 },
      });
      expect(nodeById.get("core:catalog:publish-catalog-item")).toMatchObject({
        parentId: "pkg:catalog",
        position: { x: 584, y: 76 },
      });
      expect(nodeById.get("core:catalog:product-repository")).toMatchObject({
        parentId: "pkg:catalog",
        position: { x: 864, y: 76 },
      });
      expect(nodeById.get("core:orders:submit-order")).toMatchObject({
        parentId: "pkg:orders",
        position: { x: 304, y: 76 },
      });
      expect(nodeById.get("core:orders:order-repository")).toMatchObject({
        parentId: "pkg:orders",
        position: { x: 864, y: 76 },
      });
      expect(projection.edges).toEqual([]);
    } finally {
      await server.close();
    }
  });
});

async function createAssetFixture(): Promise<string> {
  const rootDir = await mkdtemp(path.join(tmpdir(), "gordio-viewer-assets-"));
  fixtureDirs.push(rootDir);

  await mkdir(rootDir, { recursive: true });
  await writeFile(path.join(rootDir, "viewer.js"), "console.log('viewer script');", "utf8");
  await writeFile(path.join(rootDir, "viewer.css"), "/* viewer style */", "utf8");

  return rootDir;
}
