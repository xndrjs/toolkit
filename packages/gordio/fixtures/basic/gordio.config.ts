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
            sourceId: createEndpointId(edge, "source", context.createId),
            targetId: createEndpointId(edge, "target", context.createId),
            kind: edge.kind,
            directed: true,
          })),
        };
      },
    },
  ],
});

function createEndpointId(
  edge: FixtureEdge,
  side: "source" | "target",
  createId: (...parts: string[]) => string
): string {
  const endpoint = edge[side];

  if (endpoint.kind === "box") {
    return createId(endpoint.scope, endpoint.package);
  }

  return createId(endpoint.prefix, endpoint.package, endpoint.node);
}

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
  source: FixtureEndpoint;
  target: FixtureEndpoint;
  kind: string;
}

type FixtureEndpoint =
  | {
      kind: "node";
      prefix: string;
      package: string;
      node: string;
    }
  | {
      kind: "box";
      scope: "app" | "pkg";
      package: string;
    };
