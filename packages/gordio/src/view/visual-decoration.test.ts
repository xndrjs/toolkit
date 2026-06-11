import { describe, expect, it } from "vitest";

import { createEdgeKey } from "../graph/create-edge-key";
import type { ArchitectureGraph } from "../graph/types";
import { cleanArchitecturePreset } from "../presets/clean-architecture";
import {
  deriveEdgeVisualStates,
  deriveBoxVisualStates,
  resolveEdgeVisualState,
} from "./visual-decoration";

const graph: ArchitectureGraph = {
  boxes: [
    { id: "app:web", kind: "app", title: "Web", laneId: "apps" },
    { id: "pkg:orders", kind: "core-package", title: "Orders", laneId: "core" },
    { id: "pkg:billing", kind: "core-package", title: "Billing", laneId: "core" },
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
    {
      id: "core:billing:charge-customer",
      kind: "capability",
      title: "ChargeCustomer",
      boxId: "pkg:billing",
    },
  ],
  edges: [
    {
      sourceId: "app:web:composition-root",
      targetId: "pkg:billing",
      kind: "opens",
      directed: true,
    },
    {
      sourceId: "app:web:composition-root",
      targetId: "core:orders:place-order",
      kind: "uses",
      directed: true,
    },
  ],
};

describe("resolveEdgeVisualState", () => {
  it("degrades mixed highlighted and normal endpoints to normal", () => {
    expect(resolveEdgeVisualState("highlighted", "normal")).toBe("normal");
    expect(resolveEdgeVisualState("highlighted", "highlighted")).toBe("highlighted");
  });
});

describe("deriveEdgeVisualStates", () => {
  it("mutes opens edges whose box endpoint is muted", () => {
    const nodeStates = {
      "app:web:composition-root": "highlighted" as const,
      "core:orders:place-order": "normal" as const,
      "core:billing:charge-customer": "muted" as const,
    };
    const boxStates = deriveBoxVisualStates(graph, nodeStates);
    const edgeStates = deriveEdgeVisualStates(
      graph,
      cleanArchitecturePreset,
      {},
      nodeStates,
      boxStates
    );

    expect(boxStates["pkg:billing"]).toBe("muted");
    expect(edgeStates[createEdgeKey(graph.edges[0]!)]).toBe("muted");
  });

  it("mutes outgoing edges from a muted app even when node decoration is sparse", () => {
    const nodeStates = {
      "app:web:composition-root": "highlighted" as const,
    };
    const sparseGraph: ArchitectureGraph = {
      boxes: [
        { id: "app:web", kind: "app", title: "Web", laneId: "apps" },
        { id: "app:mobile", kind: "app", title: "Mobile", laneId: "apps" },
        { id: "pkg:orders", kind: "core-package", title: "Orders", laneId: "core" },
      ],
      nodes: [
        graph.nodes[0]!,
        {
          id: "app:mobile:composition-root",
          kind: "composition-root",
          title: "Mobile",
          boxId: "app:mobile",
        },
        graph.nodes[1]!,
      ],
      edges: [
        {
          sourceId: "app:mobile:composition-root",
          targetId: "pkg:orders",
          kind: "opens",
          directed: true,
        },
      ],
    };
    const boxStates = deriveBoxVisualStates(sparseGraph, nodeStates);
    const edgeStates = deriveEdgeVisualStates(
      sparseGraph,
      cleanArchitecturePreset,
      {},
      nodeStates,
      boxStates
    );

    expect(boxStates["app:mobile"]).toBe("muted");
    expect(edgeStates[createEdgeKey(sparseGraph.edges[0]!)]).toBe("muted");
  });

  it("mutes every outgoing edge from a muted composition root", () => {
    const nodeStates = {
      "app:web:composition-root": "highlighted" as const,
      "app:mobile:composition-root": "muted" as const,
      "core:orders:place-order": "normal" as const,
      "core:catalog:publish-catalog-item": "normal" as const,
    };
    const multiRootGraph: ArchitectureGraph = {
      ...graph,
      nodes: [
        graph.nodes[0]!,
        {
          id: "app:mobile:composition-root",
          kind: "composition-root",
          title: "Mobile",
          boxId: "app:mobile",
        },
        graph.nodes[1]!,
        graph.nodes[2]!,
      ],
      boxes: [
        graph.boxes[0]!,
        { id: "app:mobile", kind: "app", title: "Mobile", laneId: "apps" },
        graph.boxes[2]!,
      ],
      edges: [
        {
          sourceId: "app:mobile:composition-root",
          targetId: "pkg:orders",
          kind: "opens",
          directed: true,
        },
        {
          sourceId: "app:mobile:composition-root",
          targetId: "core:orders:place-order",
          kind: "uses",
          directed: true,
        },
        graph.edges[0]!,
        graph.edges[1]!,
      ],
    };
    const boxStates = deriveBoxVisualStates(multiRootGraph, nodeStates);
    const edgeStates = deriveEdgeVisualStates(
      multiRootGraph,
      cleanArchitecturePreset,
      {},
      nodeStates,
      boxStates
    );

    expect(edgeStates[createEdgeKey(multiRootGraph.edges[0]!)]).toBe("muted");
    expect(edgeStates[createEdgeKey(multiRootGraph.edges[1]!)]).toBe("muted");
  });

  it("mutes rerouted edges that visually attach to a muted box shell", () => {
    const nodeStates = {
      "app:web:composition-root": "highlighted" as const,
      "core:orders:place-order": "normal" as const,
      "core:billing:charge-customer": "muted" as const,
    };
    const boxStates = deriveBoxVisualStates(graph, nodeStates);
    const edgeStates = deriveEdgeVisualStates(
      graph,
      cleanArchitecturePreset,
      { collapsedBoxes: { "pkg:orders": true } },
      nodeStates,
      boxStates
    );

    expect(boxStates["pkg:orders"]).toBe("normal");
    expect(edgeStates[createEdgeKey(graph.edges[1]!)]).toBe("normal");

    const mutedOrdersBoxStates = { ...boxStates, "pkg:orders": "muted" as const };
    const mutedEdgeStates = deriveEdgeVisualStates(
      graph,
      cleanArchitecturePreset,
      { collapsedBoxes: { "pkg:orders": true } },
      nodeStates,
      mutedOrdersBoxStates
    );

    expect(mutedEdgeStates[createEdgeKey(graph.edges[1]!)]).toBe("muted");
  });
});
