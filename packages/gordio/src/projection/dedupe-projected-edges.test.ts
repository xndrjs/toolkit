import { describe, expect, it } from "vitest";

import { createEdgeKey } from "../graph/create-edge-key";
import type { ArchitectureGraph } from "../graph/types";
import { cleanArchitecturePreset } from "../presets/clean-architecture";
import { createProjectedEdgeVisualKey, dedupeProjectedEdges } from "./dedupe-projected-edges";
import { toReactFlowGraph } from "./to-react-flow-graph";

describe("dedupeProjectedEdges", () => {
  it("merges architecture edges that project to the same visual path", () => {
    const graph: ArchitectureGraph = {
      boxes: [
        { id: "app:web", kind: "app", title: "Web", laneId: "apps" },
        { id: "pkg:orders", kind: "core-package", title: "Orders", laneId: "core" },
      ],
      nodes: [
        {
          id: "app:web:composition-root",
          kind: "composition-root",
          title: "WebApp",
          boxId: "app:web",
        },
        {
          id: "core:orders:place-order",
          kind: "use-case",
          title: "PlaceOrder",
          boxId: "pkg:orders",
        },
      ],
      edges: [
        {
          sourceId: "app:web:composition-root",
          targetId: "pkg:orders",
          kind: "opens",
          directed: true,
          metadata: { sourceHandle: "source-right", targetHandle: "target-left" },
        },
        {
          sourceId: "app:web:composition-root",
          targetId: "core:orders:place-order",
          kind: "uses",
          directed: true,
          metadata: { sourceHandle: "source-right", targetHandle: "target-left" },
        },
      ],
    };
    const projection = toReactFlowGraph({ graph, schema: cleanArchitecturePreset });

    expect(projection.edges).toHaveLength(1);
    expect(projection.edges[0]?.data.architectureEdgeKeys).toEqual([
      createEdgeKey(graph.edges[0]!),
      createEdgeKey(graph.edges[1]!),
    ]);
    expect(projection.edges[0]?.id).toBe(
      createProjectedEdgeVisualKey({
        source: "app:web:composition-root",
        target: "pkg:orders",
        sourceHandle: "source-right",
        targetHandle: "target-left",
      })
    );
  });

  it("keeps distinct visual paths separate", () => {
    const edges = dedupeProjectedEdges([
      {
        id: "a",
        source: "app:web:composition-root",
        target: "pkg:orders",
        sourceHandle: "source-right",
        targetHandle: "target-left",
        type: "architectureEdge",
        animated: true,
        data: {
          edge: {
            sourceId: "app:web:composition-root",
            targetId: "pkg:orders",
            directed: true,
          },
          directed: true,
          sourceId: "app:web:composition-root",
          targetId: "pkg:orders",
          rerouted: false,
        },
      },
      {
        id: "b",
        source: "app:web:composition-root",
        target: "pkg:catalog",
        sourceHandle: "source-right",
        targetHandle: "target-left",
        type: "architectureEdge",
        animated: true,
        data: {
          edge: {
            sourceId: "app:web:composition-root",
            targetId: "pkg:catalog",
            directed: true,
          },
          directed: true,
          sourceId: "app:web:composition-root",
          targetId: "pkg:catalog",
          rerouted: false,
        },
      },
    ]);

    expect(edges).toHaveLength(2);
  });
});
