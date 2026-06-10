import { createEdgeKey } from "../graph/create-edge-key";
import type {
  ArchitectureGraph,
  ArchitectureId,
  ArchitectureViewSchema,
  EdgeKey,
} from "../graph/types";
import type { ArchitectureViewState, VisualState } from "../projection/types";
import type { DecorationPatch } from "./types";

export function createArchitectureViewState(
  graph: ArchitectureGraph,
  schema: ArchitectureViewSchema
): ArchitectureViewState {
  const boxKindsById = new Map(schema.boxKinds.map((boxKind) => [boxKind.id, boxKind]));
  const collapsedBoxes: Record<ArchitectureId, boolean> = {};

  for (const box of graph.boxes) {
    if (boxKindsById.get(box.kind)?.defaultCollapsed === true) {
      collapsedBoxes[box.id] = true;
    }
  }

  return {
    collapsedBoxes,
    visual: createEmptyVisualState(),
  };
}

export function createEmptyVisualState(): NonNullable<ArchitectureViewState["visual"]> {
  return {
    boxes: {},
    nodes: {},
    edges: {},
  };
}

export function resolveVisualState(
  viewState: ArchitectureViewState,
  kind: "boxes" | "nodes" | "edges",
  id: ArchitectureId | EdgeKey
): VisualState {
  return viewState.visual?.[kind][id] ?? "normal";
}

export function mergeDecorationPatch(
  viewState: ArchitectureViewState,
  patch: DecorationPatch
): ArchitectureViewState {
  const next: ArchitectureViewState = {
    ...viewState,
    collapsedBoxes: {
      ...viewState.collapsedBoxes,
      ...patch.collapsedBoxes,
    },
    visual: {
      boxes: { ...viewState.visual?.boxes, ...patch.boxes },
      nodes: { ...viewState.visual?.nodes, ...patch.nodes },
      edges: { ...viewState.visual?.edges, ...patch.edges },
    },
  };

  if (patch.selectedId === null) {
    delete next.selectedId;
  } else if (patch.selectedId !== undefined) {
    next.selectedId = patch.selectedId;
  }

  return next;
}

export function createMutedDecoration(graph: ArchitectureGraph): DecorationPatch {
  return {
    boxes: Object.fromEntries(graph.boxes.map((box) => [box.id, "muted" as const])),
    nodes: Object.fromEntries(graph.nodes.map((node) => [node.id, "muted" as const])),
    edges: Object.fromEntries(graph.edges.map((edge) => [createEdgeKey(edge), "muted" as const])),
  };
}
