import { describe, expect, it } from "vitest";

import { createEdgeKey } from "../graph/create-edge-key";
import type { ArchitectureGraph } from "../graph/types";
import { cleanArchitecturePreset } from "../presets/clean-architecture";
import { cleanArchitectureLayeredReachability } from "../presets/clean-architecture-layered-reachability";
import { computeLayeredReachability } from "./layered-reachability";
import { computeReachability } from "./reachability";
import { resolveEdgeVisualState } from "./visual-decoration";
import {
  applyArchitecturePolicies,
  clearSelectionPolicy,
  compositionReachabilityPolicy,
  createArchitectureViewState,
  directNeighbourPolicy,
  mergeDecorationPatch,
  resolveVisualState,
  toggleBoxCollapsePolicy,
} from "./index";

const directNeighbourPolicies = [
  directNeighbourPolicy,
  compositionReachabilityPolicy,
  toggleBoxCollapsePolicy,
  clearSelectionPolicy,
];

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
      id: "core:orders:place-order",
      kind: "use-case",
      title: "PlaceOrder",
      boxId: "pkg:orders",
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
      targetId: "core:orders:place-order",
      kind: "uses",
      directed: true,
    },
    {
      sourceId: "core:orders:place-order",
      targetId: "core:orders:submit-order",
      kind: "uses",
      directed: true,
    },
    {
      sourceId: "core:orders:place-order",
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
  it("highlights the selected node and normal direct neighbours when no composition is active", () => {
    const viewState = applyArchitecturePolicies({
      graph,
      schema: cleanArchitecturePreset,
      viewState: createArchitectureViewState(graph, cleanArchitecturePreset),
      event: { type: "select-node", nodeId: "core:orders:submit-order" },
      policies: directNeighbourPolicies,
    });

    expect(viewState.selectedId).toBe("core:orders:submit-order");
    expect(resolveVisualState(viewState, "nodes", "core:orders:submit-order")).toBe("highlighted");
    expect(resolveVisualState(viewState, "nodes", "core:orders:place-order")).toBe("highlighted");
    expect(resolveVisualState(viewState, "nodes", "core:orders:order-repository")).toBe("normal");
    expect(resolveVisualState(viewState, "nodes", "app:web:composition-root")).toBe("normal");
    expect(resolveVisualState(viewState, "nodes", "infra:orders:sql-order-repository")).toBe(
      "normal"
    );
    expect(resolveVisualState(viewState, "edges", createEdgeKey(graph.edges[1]!))).toBe(
      "highlighted"
    );
    expect(resolveVisualState(viewState, "edges", createEdgeKey(graph.edges[2]!))).toBe("normal");
    expect(resolveVisualState(viewState, "edges", createEdgeKey(graph.edges[0]!))).toBe("normal");
    expect(resolveVisualState(viewState, "edges", createEdgeKey(graph.edges[3]!))).toBe("normal");
  });

  it("keeps muted nodes muted and only highlights normal neighbours within composition context", () => {
    const composed = applyArchitecturePolicies({
      graph,
      schema: cleanArchitecturePreset,
      viewState: createArchitectureViewState(graph, cleanArchitecturePreset),
      event: { type: "select-composition-root", nodeId: "app:web:composition-root" },
    });
    const viewState = applyArchitecturePolicies({
      graph,
      schema: cleanArchitecturePreset,
      viewState: composed,
      event: { type: "select-node", nodeId: "core:orders:submit-order" },
      policies: directNeighbourPolicies,
    });

    expect(viewState.selectedId).toBe("core:orders:submit-order");
    expect(resolveVisualState(viewState, "nodes", "core:orders:submit-order")).toBe("highlighted");
    expect(resolveVisualState(viewState, "nodes", "core:orders:place-order")).toBe("highlighted");
    expect(resolveVisualState(viewState, "nodes", "core:orders:order-repository")).toBe("normal");
    expect(resolveVisualState(viewState, "nodes", "app:web:composition-root")).toBe("highlighted");
    expect(resolveVisualState(viewState, "boxes", "pkg:orders")).toBe("normal");
  });

  it("highlights normal direct neighbours within composition context", () => {
    const composed = applyArchitecturePolicies({
      graph,
      schema: cleanArchitecturePreset,
      viewState: createArchitectureViewState(graph, cleanArchitecturePreset),
      event: { type: "select-composition-root", nodeId: "app:web:composition-root" },
    });
    const viewState = applyArchitecturePolicies({
      graph,
      schema: cleanArchitecturePreset,
      viewState: composed,
      event: { type: "select-node", nodeId: "core:orders:order-repository" },
      policies: directNeighbourPolicies,
    });

    expect(resolveVisualState(viewState, "nodes", "core:orders:order-repository")).toBe(
      "highlighted"
    );
    expect(resolveVisualState(viewState, "nodes", "core:orders:place-order")).toBe("highlighted");
    expect(resolveVisualState(viewState, "nodes", "core:orders:submit-order")).toBe("normal");
    expect(resolveVisualState(viewState, "nodes", "infra:orders:sql-order-repository")).toBe(
      "highlighted"
    );
    expect(resolveVisualState(viewState, "nodes", "app:web:composition-root")).toBe("highlighted");
  });

  it("ignores clicks on muted nodes", () => {
    const multiAppGraph: ArchitectureGraph = {
      ...graph,
      boxes: [
        graph.boxes[0]!,
        { id: "app:mobile", kind: "app", title: "Mobile", laneId: "apps" },
        graph.boxes[1]!,
        graph.boxes[2]!,
      ],
      nodes: [
        graph.nodes[0]!,
        {
          id: "app:mobile:composition-root",
          kind: "composition-root",
          title: "MobileApp",
          boxId: "app:mobile",
        },
        ...graph.nodes.slice(1),
      ],
    };
    const composed = applyArchitecturePolicies({
      graph: multiAppGraph,
      schema: cleanArchitecturePreset,
      viewState: createArchitectureViewState(multiAppGraph, cleanArchitecturePreset),
      event: { type: "select-composition-root", nodeId: "app:web:composition-root" },
    });
    const viewState = applyArchitecturePolicies({
      graph: multiAppGraph,
      schema: cleanArchitecturePreset,
      viewState: composed,
      event: { type: "select-node", nodeId: "app:mobile:composition-root" },
      policies: directNeighbourPolicies,
    });

    expect(viewState.selectedId).toBe("app:web:composition-root");
    expect(resolveVisualState(viewState, "nodes", "app:mobile:composition-root")).toBe("muted");
    expect(resolveVisualState(viewState, "nodes", "app:web:composition-root")).toBe("highlighted");
  });

  it("restores composition reachability when re-clicking the selected node", () => {
    const composed = applyArchitecturePolicies({
      graph,
      schema: cleanArchitecturePreset,
      viewState: createArchitectureViewState(graph, cleanArchitecturePreset),
      event: { type: "select-composition-root", nodeId: "app:web:composition-root" },
    });
    const highlighted = applyArchitecturePolicies({
      graph,
      schema: cleanArchitecturePreset,
      viewState: composed,
      event: { type: "select-node", nodeId: "core:orders:submit-order" },
      policies: directNeighbourPolicies,
    });
    const restored = applyArchitecturePolicies({
      graph,
      schema: cleanArchitecturePreset,
      viewState: highlighted,
      event: { type: "select-node", nodeId: "core:orders:submit-order" },
      policies: directNeighbourPolicies,
    });

    expect(resolveVisualState(highlighted, "nodes", "app:web:composition-root")).toBe(
      "highlighted"
    );
    expect(highlighted.compositionRootId).toBe("app:web:composition-root");
    expect(restored.compositionRootId).toBe("app:web:composition-root");
    expect(restored.selectedId).toBe("app:web:composition-root");
    expect(resolveVisualState(restored, "nodes", "app:web:composition-root")).toBe("highlighted");
    expect(resolveVisualState(restored, "nodes", "core:orders:submit-order")).toBe("normal");
    expect(resolveVisualState(restored, "nodes", "core:orders:place-order")).toBe("normal");
  });

  it("clears node selection when re-clicking without an active composition root", () => {
    const highlighted = applyArchitecturePolicies({
      graph,
      schema: cleanArchitecturePreset,
      viewState: createArchitectureViewState(graph, cleanArchitecturePreset),
      event: { type: "select-node", nodeId: "core:orders:submit-order" },
      policies: directNeighbourPolicies,
    });
    const restored = applyArchitecturePolicies({
      graph,
      schema: cleanArchitecturePreset,
      viewState: highlighted,
      event: { type: "select-node", nodeId: "core:orders:submit-order" },
      policies: directNeighbourPolicies,
    });

    expect(restored.selectedId).toBeUndefined();
    expect(restored.compositionRootId).toBeUndefined();
    expect(resolveVisualState(restored, "nodes", "core:orders:submit-order")).toBe("normal");
    expect(resolveVisualState(restored, "nodes", "core:orders:place-order")).toBe("normal");
  });

  it("treats edges as undirected when exploring direct neighbours", () => {
    const viewState = applyArchitecturePolicies({
      graph,
      schema: cleanArchitecturePreset,
      viewState: createArchitectureViewState(graph, cleanArchitecturePreset),
      event: { type: "select-node", nodeId: "core:orders:order-repository" },
      policies: directNeighbourPolicies,
    });

    expect(resolveVisualState(viewState, "nodes", "infra:orders:sql-order-repository")).toBe(
      "highlighted"
    );
    expect(resolveVisualState(viewState, "edges", createEdgeKey(graph.edges[3]!))).toBe(
      "highlighted"
    );
  });
});

describe("compositionReachabilityPolicy", () => {
  it("keeps core boxes reachable when composition opens them directly", () => {
    const graphWithBoxOpens: ArchitectureGraph = {
      ...graph,
      edges: [
        {
          sourceId: "app:web:composition-root",
          targetId: "pkg:orders",
          kind: "opens",
          directed: true,
        },
        {
          sourceId: "app:web:composition-root",
          targetId: "pkg:orders-infra",
          kind: "opens",
          directed: true,
        },
      ],
    };
    const viewState = applyArchitecturePolicies({
      graph: graphWithBoxOpens,
      schema: cleanArchitecturePreset,
      viewState: createArchitectureViewState(graphWithBoxOpens, cleanArchitecturePreset),
      event: { type: "select-composition-root", nodeId: "app:web:composition-root" },
    });

    expect(viewState.collapsedBoxes).toMatchObject({
      "app:web": false,
      "pkg:orders": false,
      "pkg:orders-infra": false,
    });
  });

  it("keeps wired use-cases and their downstream nodes normal", () => {
    const graphWithOpenedUseCases: ArchitectureGraph = {
      ...graph,
      nodes: [
        graph.nodes[0]!,
        {
          id: "core:orders:order",
          kind: "model",
          title: "Order",
          boxId: "pkg:orders",
        },
        graph.nodes[1]!,
        graph.nodes[2]!,
        graph.nodes[3]!,
        graph.nodes[4]!,
        {
          id: "core:catalog:publish-catalog-item",
          kind: "use-case",
          title: "PublishCatalogItem",
          boxId: "pkg:catalog",
        },
        {
          id: "core:catalog:publish-product",
          kind: "capability",
          title: "PublishProduct",
          boxId: "pkg:catalog",
        },
      ],
      boxes: [
        graph.boxes[0]!,
        graph.boxes[1]!,
        { id: "pkg:catalog", kind: "core-package", title: "Catalog", laneId: "core" },
        graph.boxes[2]!,
      ],
      edges: [
        {
          sourceId: "app:web:composition-root",
          targetId: "core:orders:place-order",
          kind: "uses",
          directed: true,
        },
        {
          sourceId: "app:web:composition-root",
          targetId: "core:catalog:publish-catalog-item",
          kind: "uses",
          directed: true,
        },
        {
          sourceId: "app:web:composition-root",
          targetId: "pkg:orders",
          kind: "opens",
          directed: true,
        },
        {
          sourceId: "app:web:composition-root",
          targetId: "pkg:catalog",
          kind: "opens",
          directed: true,
        },
        {
          sourceId: "core:orders:order",
          targetId: "core:orders:submit-order",
          kind: "uses",
          directed: true,
        },
        graph.edges[1]!,
        graph.edges[2]!,
        {
          sourceId: "core:catalog:publish-catalog-item",
          targetId: "core:catalog:publish-product",
          kind: "uses",
          directed: true,
        },
        graph.edges[3]!,
      ],
    };
    const viewState = applyArchitecturePolicies({
      graph: graphWithOpenedUseCases,
      schema: cleanArchitecturePreset,
      viewState: createArchitectureViewState(graphWithOpenedUseCases, cleanArchitecturePreset),
      event: { type: "select-composition-root", nodeId: "app:web:composition-root" },
    });

    expect(resolveVisualState(viewState, "nodes", "core:orders:place-order")).toBe("normal");
    expect(resolveVisualState(viewState, "nodes", "core:orders:submit-order")).toBe("normal");
    expect(resolveVisualState(viewState, "nodes", "core:orders:order-repository")).toBe("normal");
    expect(resolveVisualState(viewState, "nodes", "core:orders:order")).toBe("normal");
    expect(resolveVisualState(viewState, "nodes", "core:catalog:publish-catalog-item")).toBe(
      "normal"
    );
    expect(resolveVisualState(viewState, "nodes", "core:catalog:publish-product")).toBe("normal");
    expect(resolveVisualState(viewState, "nodes", "infra:orders:sql-order-repository")).toBe(
      "normal"
    );
  });

  it("expands reachable boxes, collapses unreachable non-app boxes, and derives edge states from endpoints", () => {
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
      "pkg:orders-infra": false,
    });
    expect(resolveVisualState(viewState, "nodes", "app:web:composition-root")).toBe("highlighted");
    expect(resolveVisualState(viewState, "nodes", "core:orders:place-order")).toBe("normal");
    expect(resolveVisualState(viewState, "nodes", "core:orders:submit-order")).toBe("normal");
    expect(resolveVisualState(viewState, "nodes", "core:orders:order-repository")).toBe("normal");
    expect(resolveVisualState(viewState, "nodes", "infra:orders:sql-order-repository")).toBe(
      "normal"
    );
    expect(resolveVisualState(viewState, "edges", createEdgeKey(graph.edges[0]!))).toBe("normal");
    expect(resolveVisualState(viewState, "edges", createEdgeKey(graph.edges[1]!))).toBe("normal");
    expect(resolveVisualState(viewState, "edges", createEdgeKey(graph.edges[2]!))).toBe("normal");
    expect(resolveVisualState(viewState, "edges", createEdgeKey(graph.edges[3]!))).toBe("normal");
    expect(resolveVisualState(viewState, "boxes", "app:web")).toBe("normal");
    expect(resolveVisualState(viewState, "boxes", "pkg:orders")).toBe("normal");
    expect(resolveVisualState(viewState, "boxes", "pkg:orders-infra")).toBe("normal");
  });

  it("highlights the selected composition root, keeps its app box normal, and mutes other apps", () => {
    const multiAppGraph: ArchitectureGraph = {
      ...graph,
      boxes: [
        graph.boxes[0]!,
        { id: "app:mobile", kind: "app", title: "Mobile", laneId: "apps" },
        { id: "app:admin", kind: "app", title: "Admin", laneId: "apps" },
        graph.boxes[1]!,
        graph.boxes[2]!,
      ],
      nodes: [
        graph.nodes[0]!,
        {
          id: "app:web:worker-composition-root",
          kind: "composition-root",
          title: "WebWorker",
          boxId: "app:web",
        },
        {
          id: "app:mobile:composition-root",
          kind: "composition-root",
          title: "MobileApp",
          boxId: "app:mobile",
        },
        {
          id: "app:admin:composition-root",
          kind: "composition-root",
          title: "AdminApp",
          boxId: "app:admin",
        },
        ...graph.nodes.slice(1),
      ],
      edges: [
        ...graph.edges,
        {
          sourceId: "app:mobile:composition-root",
          targetId: "core:orders:place-order",
          kind: "uses",
          directed: true,
        },
      ],
    };
    const viewState = applyArchitecturePolicies({
      graph: multiAppGraph,
      schema: cleanArchitecturePreset,
      viewState: createArchitectureViewState(multiAppGraph, cleanArchitecturePreset),
      event: { type: "select-composition-root", nodeId: "app:web:composition-root" },
    });

    expect(resolveVisualState(viewState, "nodes", "app:web:composition-root")).toBe("highlighted");
    expect(resolveVisualState(viewState, "nodes", "app:web:worker-composition-root")).toBe("muted");
    expect(resolveVisualState(viewState, "nodes", "app:mobile:composition-root")).toBe("muted");
    expect(resolveVisualState(viewState, "nodes", "app:admin:composition-root")).toBe("muted");
    expect(resolveVisualState(viewState, "boxes", "app:web")).toBe("normal");
    expect(resolveVisualState(viewState, "boxes", "app:mobile")).toBe("muted");
    expect(resolveVisualState(viewState, "boxes", "app:admin")).toBe("muted");
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
      policies: directNeighbourPolicies,
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

describe("computeLayeredReachability", () => {
  it("includes models connected to reachable operations regardless of edge direction", () => {
    const result = computeLayeredReachability(
      {
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
            id: "core:orders:order",
            kind: "model",
            title: "Order",
            boxId: "pkg:orders",
          },
          {
            id: "core:orders:place-order",
            kind: "use-case",
            title: "PlaceOrder",
            boxId: "pkg:orders",
          },
          {
            id: "core:orders:submit-order",
            kind: "capability",
            title: "SubmitOrder",
            boxId: "pkg:orders",
          },
        ],
        edges: [
          {
            sourceId: "app:web:composition-root",
            targetId: "core:orders:place-order",
            kind: "uses",
            directed: true,
          },
          {
            sourceId: "core:orders:order",
            targetId: "core:orders:submit-order",
            kind: "uses",
            directed: true,
          },
          {
            sourceId: "core:orders:place-order",
            targetId: "core:orders:submit-order",
            kind: "uses",
            directed: true,
          },
        ],
      },
      cleanArchitecturePreset,
      "app:web:composition-root",
      cleanArchitectureLayeredReachability
    );

    expect(result.activeNodeIds.has("core:orders:order")).toBe(true);
  });

  it("activates only wired use-cases, not every use-case in an opened box", () => {
    const result = computeLayeredReachability(
      {
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
          {
            id: "core:orders:cancel-order",
            kind: "use-case",
            title: "CancelOrder",
            boxId: "pkg:orders",
          },
          {
            id: "core:orders:submit-order",
            kind: "capability",
            title: "SubmitOrder",
            boxId: "pkg:orders",
          },
        ],
        edges: [
          {
            sourceId: "app:web:composition-root",
            targetId: "pkg:orders",
            kind: "opens",
            directed: true,
          },
          {
            sourceId: "app:web:composition-root",
            targetId: "core:orders:place-order",
            kind: "uses",
            directed: true,
          },
          {
            sourceId: "core:orders:place-order",
            targetId: "core:orders:submit-order",
            kind: "uses",
            directed: true,
          },
        ],
      },
      cleanArchitecturePreset,
      "app:web:composition-root",
      cleanArchitectureLayeredReachability
    );

    expect([...result.activeNodeIds]).toEqual([
      "app:web:composition-root",
      "core:orders:place-order",
      "core:orders:submit-order",
    ]);
    expect(result.openedBoxIds.has("pkg:orders")).toBe(true);
  });
});

describe("resolveEdgeVisualState", () => {
  it("degrades mixed highlighted and normal endpoints to normal", () => {
    expect(resolveEdgeVisualState("highlighted", "normal")).toBe("normal");
    expect(resolveEdgeVisualState("normal", "highlighted")).toBe("normal");
    expect(resolveEdgeVisualState("highlighted", "highlighted")).toBe("highlighted");
  });
});

describe("computeReachability", () => {
  it("tracks downstream path edges separately from the full reachable subgraph", () => {
    const downstream = computeReachability(graph, "app:web:composition-root", "downstream");

    expect([...downstream.reachableNodeIds]).toEqual([
      "app:web:composition-root",
      "core:orders:place-order",
      "core:orders:submit-order",
      "core:orders:order-repository",
    ]);
    expect([...downstream.pathEdgeKeys]).toEqual([
      createEdgeKey(graph.edges[0]!),
      createEdgeKey(graph.edges[1]!),
      createEdgeKey(graph.edges[2]!),
    ]);
  });

  it("follows upstream edges when requested", () => {
    const upstream = computeReachability(graph, "core:orders:order-repository", "upstream");

    expect([...upstream.reachableNodeIds]).toEqual([
      "core:orders:order-repository",
      "core:orders:place-order",
      "infra:orders:sql-order-repository",
      "app:web:composition-root",
    ]);
    expect(upstream.pathEdgeKeys.has(createEdgeKey(graph.edges[3]!))).toBe(true);
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
