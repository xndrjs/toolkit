import { createEdgeKey } from "../graph/create-edge-key";
import type { ArchitectureGraph, ArchitectureId, EdgeKey } from "../graph/types";
import type { ArchitectureViewState, VisualState } from "../projection/types";

const VISUAL_STATE_RANK: Record<VisualState, number> = {
  muted: 0,
  normal: 1,
  highlighted: 2,
};

export function resolveEdgeVisualState(
  sourceState: VisualState,
  targetState: VisualState
): VisualState {
  return VISUAL_STATE_RANK[sourceState] <= VISUAL_STATE_RANK[targetState]
    ? sourceState
    : targetState;
}

export function deriveBoxVisualStates(
  graph: ArchitectureGraph,
  nodeStates: Record<ArchitectureId, VisualState>
): Record<ArchitectureId, VisualState> {
  const boxStates: Record<ArchitectureId, VisualState> = {};

  for (const box of graph.boxes) {
    const childStates = graph.nodes
      .filter((node) => node.boxId === box.id)
      .map((node) => nodeStates[node.id] ?? "normal");

    if (childStates.length === 0) {
      boxStates[box.id] = "muted";
      continue;
    }

    if (childStates.every((state) => state === "muted")) {
      boxStates[box.id] = "muted";
      continue;
    }

    if (childStates.some((state) => state === "normal")) {
      boxStates[box.id] = "normal";
      continue;
    }

    if (box.kind === "app" && childStates.some((state) => state === "highlighted")) {
      boxStates[box.id] = "normal";
      continue;
    }

    boxStates[box.id] = "muted";
  }

  return boxStates;
}

export function deriveEdgeVisualStates(
  graph: ArchitectureGraph,
  nodeStates: Record<ArchitectureId, VisualState>,
  boxStates: Record<ArchitectureId, VisualState>
): Record<EdgeKey, VisualState> {
  const edgeStates: Record<EdgeKey, VisualState> = {};

  for (const edge of graph.edges) {
    const sourceState = resolveEndpointVisualState(edge.sourceId, nodeStates, boxStates);
    const targetState = resolveEndpointVisualState(edge.targetId, nodeStates, boxStates);
    edgeStates[createEdgeKey(edge)] = resolveEdgeVisualState(sourceState, targetState);
  }

  return edgeStates;
}

function resolveEndpointVisualState(
  endpointId: ArchitectureId,
  nodeStates: Record<ArchitectureId, VisualState>,
  boxStates: Record<ArchitectureId, VisualState>
): VisualState {
  return nodeStates[endpointId] ?? boxStates[endpointId] ?? "normal";
}

export function finalizeVisualDecoration(
  graph: ArchitectureGraph,
  viewState: ArchitectureViewState
): ArchitectureViewState {
  const nodeStates = viewState.visual?.nodes ?? {};
  const boxStates = deriveBoxVisualStates(graph, nodeStates);
  const edgeStates = deriveEdgeVisualStates(graph, nodeStates, boxStates);

  return {
    ...viewState,
    visual: {
      boxes: boxStates,
      nodes: nodeStates,
      edges: edgeStates,
    },
  };
}
