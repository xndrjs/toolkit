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
    boxes: [{ id: "pkg:orders", kind: "core-package", title: "Orders", laneId: "core" }],
    nodes: [
      {
        id: "core:orders:submit-order",
        kind: "capability",
        title: "SubmitOrder",
        boxId: "pkg:orders",
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
      await expect(projectionResponse.json()).resolves.toMatchObject({
        nodes: [
          {
            id: "pkg:orders",
            type: "architectureBox",
            position: { x: 424, y: 80 },
          },
          {
            id: "core:orders:submit-order",
            type: "architectureNode",
            parentId: "pkg:orders",
          },
        ],
        edges: [],
      });
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
