import { describe, expect, it } from "vitest";

import { createEdgeKey } from "../graph/create-edge-key";
import type { ArchitectureGraph } from "../graph/types";
import { cleanArchitecturePreset } from "../presets/clean-architecture";
import { computeReachability } from "./reachability";
import {
  applyArchitecturePolicies,
  createArchitectureViewState,
  mergeDecorationPatch,
  resolveVisualState,
} from "./index";

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

describe("createArchitectureViewState", () => {
  it("starts with empty visual decoration and no selection", () => {
    const viewState = createArchitectureViewState(graph, cleanArchitecturePreset);

    expect(viewState.selectedId).toBeUndefined();
    expect(viewState.visual).toEqual({
      boxes: {},
      nodes: {},
      edges: {},
    });
  });
});

describe("directNeighbourPolicy", () => {
  it("highlights the selected node, direct neighbours, and incident edges", () => {
    const viewState = applyArchitecturePolicies({
      graph,
      schema: cleanArchitecturePreset,
      viewState: createArchitectureViewState(graph, cleanArchitecturePreset),
      event: { type: "select-node", nodeId: "core:orders:submit-order" },
    });

    expect(viewState.selectedId).toBe("core:orders:submit-order");
    expect(resolveVisualState(viewState, "nodes", "core:orders:submit-order")).toBe("highlighted");
    expect(resolveVisualState(viewState, "nodes", "app:web:composition-root")).toBe("highlighted");
    expect(resolveVisualState(viewState, "nodes", "core:orders:order-repository")).toBe(
      "highlighted"
    );
    expect(resolveVisualState(viewState, "nodes", "infra:orders:sql-order-repository")).toBe(
      "muted"
    );
    expect(resolveVisualState(viewState, "edges", createEdgeKey(graph.edges[0]!))).toBe(
      "highlighted"
    );
    expect(resolveVisualState(viewState, "edges", createEdgeKey(graph.edges[1]!))).toBe(
      "highlighted"
    );
    expect(resolveVisualState(viewState, "edges", createEdgeKey(graph.edges[2]!))).toBe("muted");
  });

  it("keeps boxes with highlighted nodes visible while muting unrelated boxes", () => {
    const viewState = applyArchitecturePolicies({
      graph,
      schema: cleanArchitecturePreset,
      viewState: createArchitectureViewState(graph, cleanArchitecturePreset),
      event: { type: "select-node", nodeId: "core:orders:submit-order" },
    });

    expect(resolveVisualState(viewState, "boxes", "app:web")).toBe("normal");
    expect(resolveVisualState(viewState, "boxes", "pkg:orders")).toBe("normal");
    expect(resolveVisualState(viewState, "boxes", "pkg:orders-infra")).toBe("muted");
  });

  it("treats edges as undirected when exploring direct neighbours", () => {
    const viewState = applyArchitecturePolicies({
      graph,
      schema: cleanArchitecturePreset,
      viewState: createArchitectureViewState(graph, cleanArchitecturePreset),
      event: { type: "select-node", nodeId: "core:orders:order-repository" },
    });

    expect(resolveVisualState(viewState, "nodes", "infra:orders:sql-order-repository")).toBe(
      "highlighted"
    );
    expect(resolveVisualState(viewState, "edges", createEdgeKey(graph.edges[2]!))).toBe(
      "highlighted"
    );
  });
});

describe("compositionReachabilityPolicy", () => {
  it("expands reachable boxes, collapses unreachable non-app boxes, and highlights path edges", () => {
    const initial = createArchitectureViewState(graph, cleanArchitecturePreset);
    const viewState = applyArchitecturePolicies({
      graph,
      schema: cleanArchitecturePreset,
      viewState: initial,
      event: { type: "select-composition-root", nodeId: "app:web:composition-root" },
    });

    expect(viewState.selectedId).toBe("app:web:composition-root");
    expect(viewState.collapsedBoxes).toMatchObject({
      "app:web": false,
      "pkg:orders": false,
      "pkg:orders-infra": true,
    });
    expect(resolveVisualState(viewState, "nodes", "app:web:composition-root")).toBe("highlighted");
    expect(resolveVisualState(viewState, "nodes", "core:orders:submit-order")).toBe("normal");
    expect(resolveVisualState(viewState, "nodes", "core:orders:order-repository")).toBe("normal");
    expect(resolveVisualState(viewState, "nodes", "infra:orders:sql-order-repository")).toBe(
      "muted"
    );
    expect(resolveVisualState(viewState, "edges", createEdgeKey(graph.edges[0]!))).toBe(
      "highlighted"
    );
    expect(resolveVisualState(viewState, "edges", createEdgeKey(graph.edges[1]!))).toBe(
      "highlighted"
    );
    expect(resolveVisualState(viewState, "edges", createEdgeKey(graph.edges[2]!))).toBe("muted");
    expect(resolveVisualState(viewState, "boxes", "app:web")).toBe("normal");
    expect(resolveVisualState(viewState, "boxes", "pkg:orders")).toBe("normal");
    expect(resolveVisualState(viewState, "boxes", "pkg:orders-infra")).toBe("muted");
  });
});

describe("toggleBoxCollapsePolicy", () => {
  it("toggles explicit collapse state for a box", () => {
    const initial = createArchitectureViewState(graph, cleanArchitecturePreset);
    const collapsed = applyArchitecturePolicies({
      graph,
      schema: cleanArchitecturePreset,
      viewState: initial,
      event: { type: "toggle-box-collapse", boxId: "pkg:orders" },
    });
    const expanded = applyArchitecturePolicies({
      graph,
      schema: cleanArchitecturePreset,
      viewState: collapsed,
      event: { type: "toggle-box-collapse", boxId: "pkg:orders" },
    });

    expect(collapsed.collapsedBoxes?.["pkg:orders"]).toBe(true);
    expect(expanded.collapsedBoxes?.["pkg:orders"]).toBe(false);
  });
});

describe("clearSelectionPolicy", () => {
  it("clears selection and restores normal visual decoration", () => {
    const selected = applyArchitecturePolicies({
      graph,
      schema: cleanArchitecturePreset,
      viewState: createArchitectureViewState(graph, cleanArchitecturePreset),
      event: { type: "select-node", nodeId: "core:orders:submit-order" },
    });
    const cleared = applyArchitecturePolicies({
      graph,
      schema: cleanArchitecturePreset,
      viewState: selected,
      event: { type: "clear-selection" },
    });

    expect(cleared.selectedId).toBeUndefined();
    expect(resolveVisualState(cleared, "nodes", "core:orders:submit-order")).toBe("normal");
    expect(resolveVisualState(cleared, "boxes", "pkg:orders-infra")).toBe("normal");
  });

  it("expands all boxes after clearing a composition root selection", () => {
    const selected = applyArchitecturePolicies({
      graph,
      schema: cleanArchitecturePreset,
      viewState: createArchitectureViewState(graph, cleanArchitecturePreset),
      event: { type: "select-composition-root", nodeId: "app:web:composition-root" },
    });
    const cleared = applyArchitecturePolicies({
      graph,
      schema: cleanArchitecturePreset,
      viewState: selected,
      event: { type: "clear-selection" },
    });

    expect(cleared.collapsedBoxes).toEqual({
      "app:web": false,
      "pkg:orders": false,
      "pkg:orders-infra": false,
    });
  });
});

describe("computeReachability", () => {
  it("tracks downstream path edges separately from the full reachable subgraph", () => {
    const downstream = computeReachability(graph, "app:web:composition-root", "downstream");

    expect([...downstream.reachableNodeIds]).toEqual([
      "app:web:composition-root",
      "core:orders:submit-order",
      "core:orders:order-repository",
    ]);
    expect([...downstream.pathEdgeKeys]).toEqual([
      createEdgeKey(graph.edges[0]!),
      createEdgeKey(graph.edges[1]!),
    ]);
  });

  it("follows upstream edges when requested", () => {
    const upstream = computeReachability(graph, "core:orders:order-repository", "upstream");

    expect([...upstream.reachableNodeIds]).toEqual([
      "core:orders:order-repository",
      "core:orders:submit-order",
      "infra:orders:sql-order-repository",
      "app:web:composition-root",
    ]);
    expect(upstream.pathEdgeKeys.has(createEdgeKey(graph.edges[2]!))).toBe(true);
  });
});

describe("mergeDecorationPatch", () => {
  it("merges visual and collapse patches without dropping prior overrides", () => {
    const merged = mergeDecorationPatch(
      createArchitectureViewState(graph, cleanArchitecturePreset),
      {
        selectedId: "core:orders:submit-order",
        collapsedBoxes: { "pkg:orders": false },
        nodes: { "core:orders:submit-order": "highlighted" },
        boxes: { "pkg:orders": "normal" },
      }
    );

    expect(merged.selectedId).toBe("core:orders:submit-order");
    expect(merged.collapsedBoxes?.["pkg:orders"]).toBe(false);
    expect(merged.visual?.nodes["core:orders:submit-order"]).toBe("highlighted");
    expect(merged.visual?.boxes["pkg:orders"]).toBe("normal");
  });
});
