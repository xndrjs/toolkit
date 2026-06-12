import { describe, expect, it } from "vitest";

import { createEdgeKey } from "../graph/create-edge-key";
import type { ArchitectureGraph } from "../graph/types";
import { cleanArchitecturePreset } from "../presets/clean-architecture";
import { createProjectedEdgeVisualKey } from "./dedupe-projected-edges";
import { toReactFlowGraph } from "./to-react-flow-graph";

const graph: ArchitectureGraph = {
  boxes: [
    { id: "app:web", kind: "app", title: "Web", laneId: "apps" },
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
      title: "WebApp",
      boxId: "app:web",
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
  edges: [
    {
      sourceId: "app:web:composition-root",
      targetId: "core:orders:submit-order",
      kind: "uses",
      directed: true,
    },
    {
      sourceId: "core:orders:submit-order",
      targetId: "core:orders:order-repository",
      kind: "uses",
      directed: true,
    },
    {
      sourceId: "infra:orders:sql-order-repository",
      targetId: "core:orders:order-repository",
      kind: "implements",
      directed: true,
    },
  ],
};
const appToCoreEdge = graph.edges[0]!;
const coreUsesPortEdge = graph.edges[1]!;
const infraImplementsPortEdge = graph.edges[2]!;

describe("toReactFlowGraph", () => {
  it("projects boxes, child nodes, and semantic edge identities into serializable React Flow data", () => {
    const projection = toReactFlowGraph({
      graph,
      schema: cleanArchitecturePreset,
      viewState: {
        boxPositions: { "pkg:orders": { x: 120, y: 40 } },
        nodePositions: { "core:orders:submit-order": { x: 12, y: 24 } },
      },
    });
    const coreBox = projection.nodes.find((node) => node.id === "pkg:orders");
    const submitOrder = projection.nodes.find((node) => node.id === "core:orders:submit-order");
    const orderRepository = projection.nodes.find(
      (node) => node.id === "core:orders:order-repository"
    );

    expect(JSON.parse(JSON.stringify(projection))).toEqual(projection);
    expect(coreBox).toMatchObject({
      id: "pkg:orders",
      type: "architectureBox",
      position: { x: 120, y: 40 },
      data: {
        entity: "box",
        collapsed: false,
        lane: { id: "core", title: "Core", order: 2 },
      },
    });
    expect(submitOrder).toMatchObject({
      parentId: "pkg:orders",
      extent: "parent",
      position: { x: 12, y: 24 },
      data: {
        entity: "node",
        slot: { id: "operations" },
      },
    });
    expect(orderRepository).toMatchObject({
      parentId: "pkg:orders",
      position: { x: 0, y: 0 },
      data: {
        renderAs: "signature",
        slot: { id: "ports" },
      },
    });
    expect(projection.edges[0]).toMatchObject({
      id: createProjectedEdgeVisualKey({
        source: "app:web:composition-root",
        target: "pkg:orders",
        targetHandle: "target-left",
      }),
      source: "app:web:composition-root",
      target: "pkg:orders",
      targetHandle: "target-left",
      data: {
        sourceId: "app:web:composition-root",
        targetId: "core:orders:submit-order",
        rerouted: true,
        architectureEdgeKeys: [createEdgeKey(appToCoreEdge)],
      },
    });
    expect(projection.edges[1]).toMatchObject({
      id: createProjectedEdgeVisualKey({
        source: "core:orders:submit-order",
        target: "core:orders:order-repository",
      }),
      source: "core:orders:submit-order",
      target: "core:orders:order-repository",
      data: {
        directed: true,
        kind: "uses",
        sourceId: "core:orders:submit-order",
        targetId: "core:orders:order-repository",
        rerouted: false,
        architectureEdgeKeys: [createEdgeKey(coreUsesPortEdge)],
      },
    });
    expect(projection.edges[2]).toMatchObject({
      id: createProjectedEdgeVisualKey({
        source: "infra:orders:sql-order-repository",
        target: "core:orders:order-repository",
      }),
      source: "infra:orders:sql-order-repository",
      target: "core:orders:order-repository",
      data: {
        rerouted: false,
        architectureEdgeKeys: [createEdgeKey(infraImplementsPortEdge)],
      },
    });
  });

  it("omits collapsed children and reroutes external edges to the collapsed box", () => {
    const projection = toReactFlowGraph({
      graph,
      schema: cleanArchitecturePreset,
      viewState: { collapsedBoxes: { "pkg:orders": true } },
    });

    expect(projection.nodes.some((node) => node.id === "core:orders:submit-order")).toBe(false);
    expect(projection.nodes.some((node) => node.id === "core:orders:order-repository")).toBe(false);
    expect(projection.nodes.find((node) => node.id === "pkg:orders")).toMatchObject({
      data: { collapsed: true },
    });
    expect(projection.edges).toEqual([
      expect.objectContaining({
        source: "app:web:composition-root",
        target: "pkg:orders",
        data: expect.objectContaining({ rerouted: true }),
      }),
      expect.objectContaining({
        source: "infra:orders:sql-order-repository",
        target: "pkg:orders",
        data: expect.objectContaining({ rerouted: true }),
      }),
    ]);
  });
});
