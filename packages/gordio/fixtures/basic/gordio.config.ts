import { defineConfig } from "../../src/config";

export default defineConfig({
  rootDir: ".",
  matchers: [
    {
      id: "fixture-manifest",
      include: ["apps/*/package.json", "packages/*/package.json"],
      parse(file, context) {
        const manifest = JSON.parse(file.contents) as FixtureManifest;
        const graph = manifest.gordio;
        const scope = file.relativePath.startsWith("apps/") ? "app" : "pkg";
        const packageName = file.relativePath.split("/")[1] ?? manifest.name;
        const boxId = context.createId(scope, packageName);

        return {
          boxes: [
            {
              id: boxId,
              kind: graph.boxKind,
              title: graph.title,
              laneId: graph.laneId,
              packageName: manifest.name,
            },
          ],
          nodes: graph.nodes.map((node) => ({
            id: context.createId(graph.nodeIdPrefix, packageName, node.id),
            kind: node.kind,
            title: node.title,
            boxId,
            ...(node.slot ? { slot: node.slot } : {}),
          })),
        };
      },
    },
    {
      id: "fixture-edges",
      include: "gordio.edges.json",
      parse(file, context) {
        const edges = JSON.parse(file.contents) as FixtureEdge[];

        return {
          edges: edges.map((edge) => ({
            sourceId: context.createId(edge.sourcePrefix, edge.sourcePackage, edge.sourceNode),
            targetId: context.createId(edge.targetPrefix, edge.targetPackage, edge.targetNode),
            kind: edge.kind,
            directed: true,
          })),
        };
      },
    },
  ],
});

interface FixtureManifest {
  name: string;
  gordio: {
    title: string;
    laneId: string;
    boxKind: string;
    nodeIdPrefix: string;
    nodes: FixtureNode[];
  };
}

interface FixtureNode {
  id: string;
  kind: string;
  title: string;
  slot?: string;
}

interface FixtureEdge {
  sourcePrefix: string;
  sourcePackage: string;
  sourceNode: string;
  targetPrefix: string;
  targetPackage: string;
  targetNode: string;
  kind: string;
}
