import { createEdgeKey } from "../graph/create-edge-key";
import type {
  ArchitectureGraph,
  ArchitectureId,
  ArchitectureViewSchema,
  EdgeKey,
} from "../graph/types";
import type { ArchitectureViewState, VisualState } from "../projection/types";
import { createSchemaIndex, projectVisualEndpoint } from "../projection/visual-endpoint";

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

function isDecorationActive(nodeStates: Record<ArchitectureId, VisualState>): boolean {
  return Object.keys(nodeStates).length > 0;
}

function resolveNodeDecorationState(
  nodeStates: Record<ArchitectureId, VisualState>,
  nodeId: ArchitectureId,
  decorationActive: boolean
): VisualState {
  return nodeStates[nodeId] ?? (decorationActive ? "muted" : "normal");
}

export function deriveBoxVisualStates(
  graph: ArchitectureGraph,
  nodeStates: Record<ArchitectureId, VisualState>
): Record<ArchitectureId, VisualState> {
  const boxStates: Record<ArchitectureId, VisualState> = {};
  const decorationActive = isDecorationActive(nodeStates);

  for (const box of graph.boxes) {
    const childStates = graph.nodes
      .filter((node) => node.boxId === box.id)
      .map((node) => resolveNodeDecorationState(nodeStates, node.id, decorationActive));

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
  schema: ArchitectureViewSchema,
  viewState: ArchitectureViewState,
  nodeStates: Record<ArchitectureId, VisualState>,
  boxStates: Record<ArchitectureId, VisualState>
): Record<EdgeKey, VisualState> {
  const edgeStates: Record<EdgeKey, VisualState> = {};
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const boxById = new Map(graph.boxes.map((box) => [box.id, box]));
  const schemaIndex = createSchemaIndex(schema);
  const collapsedBoxIds = collectCollapsedBoxIds(graph.boxes, schemaIndex.boxKindsById, viewState);
  const decorationActive = isDecorationActive(nodeStates);

  for (const edge of graph.edges) {
    const edgeKey = createEdgeKey(edge);
    const architectureSource = nodeById.get(edge.sourceId);

    if (architectureSource?.kind === "composition-root") {
      const compositionRootState = resolveNodeDecorationState(
        nodeStates,
        edge.sourceId,
        decorationActive
      );
      const appBoxState = boxStates[architectureSource.boxId];

      if (compositionRootState === "muted" || appBoxState === "muted") {
        edgeStates[edgeKey] = "muted";
        continue;
      }
    }

    const source = projectVisualEndpoint({
      endpointId: edge.sourceId,
      otherEndpointId: edge.targetId,
      side: "source",
      nodeById,
      boxById,
      collapsedBoxIds,
      schemaIndex,
    });
    const target = projectVisualEndpoint({
      endpointId: edge.targetId,
      otherEndpointId: edge.sourceId,
      side: "target",
      nodeById,
      boxById,
      collapsedBoxIds,
      schemaIndex,
    });

    const sourceState = resolveProjectedEndpointVisualState(
      source?.id ?? edge.sourceId,
      nodeById,
      boxById,
      nodeStates,
      boxStates,
      decorationActive
    );
    const targetState = resolveProjectedEndpointVisualState(
      target?.id ?? edge.targetId,
      nodeById,
      boxById,
      nodeStates,
      boxStates,
      decorationActive
    );
    edgeStates[edgeKey] = resolveEdgeVisualState(sourceState, targetState);
  }

  return edgeStates;
}

function resolveProjectedEndpointVisualState(
  endpointId: ArchitectureId,
  nodeById: Map<ArchitectureId, ArchitectureGraph["nodes"][number]>,
  boxById: Map<ArchitectureId, ArchitectureGraph["boxes"][number]>,
  nodeStates: Record<ArchitectureId, VisualState>,
  boxStates: Record<ArchitectureId, VisualState>,
  decorationActive: boolean
): VisualState {
  if (boxById.has(endpointId)) {
    return boxStates[endpointId] ?? "muted";
  }

  const node = nodeById.get(endpointId);
  if (node) {
    if (nodeStates[endpointId] !== undefined) {
      return nodeStates[endpointId]!;
    }

    if (boxStates[node.boxId] !== undefined) {
      return boxStates[node.boxId]!;
    }

    return decorationActive ? "muted" : "normal";
  }

  return decorationActive ? "muted" : "normal";
}

function collectCollapsedBoxIds(
  boxes: ArchitectureGraph["boxes"],
  boxKindsById: Map<string, { defaultCollapsed?: boolean }>,
  viewState: ArchitectureViewState
): Set<ArchitectureId> {
  const collapsedBoxIds = new Set<ArchitectureId>();

  for (const box of boxes) {
    const explicit = viewState.collapsedBoxes?.[box.id];
    if (explicit !== undefined) {
      if (explicit) {
        collapsedBoxIds.add(box.id);
      }
      continue;
    }

    if (boxKindsById.get(box.kind)?.defaultCollapsed === true) {
      collapsedBoxIds.add(box.id);
    }
  }

  return collapsedBoxIds;
}

export function finalizeVisualDecoration(
  graph: ArchitectureGraph,
  schema: ArchitectureViewSchema,
  viewState: ArchitectureViewState
): ArchitectureViewState {
  const nodeStates = viewState.visual?.nodes ?? {};
  const boxStates = deriveBoxVisualStates(graph, nodeStates);
  const edgeStates = deriveEdgeVisualStates(graph, schema, viewState, nodeStates, boxStates);

  return {
    ...viewState,
    visual: {
      boxes: boxStates,
      nodes: nodeStates,
      edges: edgeStates,
    },
  };
}
