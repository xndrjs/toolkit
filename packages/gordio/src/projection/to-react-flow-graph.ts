import { createEdgeKey } from "../graph/create-edge-key";
import type {
  ArchitectureBox,
  ArchitectureEdge,
  ArchitectureId,
  ArchitectureNode,
  ArchitectureViewSchema,
  BoxKindDefinition,
} from "../graph/types";
import { dedupeProjectedEdges } from "./dedupe-projected-edges";
import { createSchemaIndex, projectVisualEndpoint, type SchemaIndex } from "./visual-endpoint";
import type {
  ArchitectureViewState,
  ReactFlowEdge,
  ReactFlowEdgeData,
  ReactFlowGraph,
  ReactFlowNode,
  ReactFlowNodeData,
  ReactFlowProjectionOptions,
} from "./types";

export function toReactFlowGraph(options: ReactFlowProjectionOptions): ReactFlowGraph {
  const { graph, schema } = options;
  const viewState = options.viewState ?? {};
  const schemaIndex = createSchemaIndex(schema);
  const collapsedBoxIds = collectCollapsedBoxIds(graph.boxes, schemaIndex.boxKindsById, viewState);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const boxById = new Map(graph.boxes.map((box) => [box.id, box]));

  const boxNodes = graph.boxes.map((box) =>
    createBoxNode(box, schemaIndex, viewState, collapsedBoxIds)
  );
  const childNodes = graph.nodes
    .filter((node) => !collapsedBoxIds.has(node.boxId))
    .map((node) => createChildNode(node, schemaIndex, viewState, boxById));

  const projectedEdges = graph.edges.flatMap((edge): ReactFlowEdge[] => {
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

    if (!source || !target || source.id === target.id) {
      return [];
    }

    const id = createEdgeKey(edge);
    const data: ReactFlowEdgeData = {
      edge,
      directed: edge.directed === true,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      rerouted: source.rerouted || target.rerouted,
    };

    if (edge.kind !== undefined) {
      data.kind = edge.kind;
    }

    const sourceHandle = source.handle ?? readEdgeHandle(edge.metadata, "sourceHandle");
    const targetHandle = target.handle ?? readEdgeHandle(edge.metadata, "targetHandle");

    return [
      {
        id,
        source: source.id,
        target: target.id,
        type: "architectureEdge",
        animated: edge.directed === true,
        data,
        ...(sourceHandle !== undefined ? { sourceHandle } : {}),
        ...(targetHandle !== undefined ? { targetHandle } : {}),
      },
    ];
  });

  return {
    nodes: [...boxNodes, ...childNodes],
    edges: dedupeProjectedEdges(projectedEdges),
  };
}

function collectCollapsedBoxIds(
  boxes: ArchitectureBox[],
  boxKindsById: Map<string, BoxKindDefinition>,
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

function createBoxNode(
  box: ArchitectureBox,
  schemaIndex: SchemaIndex,
  viewState: ArchitectureViewState,
  collapsedBoxIds: Set<ArchitectureId>
): ReactFlowNode {
  const boxKind = schemaIndex.boxKindsById.get(box.kind);
  const lane = schemaIndex.lanesById.get(box.laneId);
  const data: ReactFlowNodeData = {
    entity: "box",
    box,
    collapsed: collapsedBoxIds.has(box.id),
  };

  if (lane !== undefined) {
    data.lane = lane;
  }

  if (boxKind !== undefined) {
    data.boxKind = boxKind;
  }

  const size = viewState.boxSizes?.[box.id];
  if (size !== undefined) {
    data.width = size.width;
    data.height = size.height;
  }

  return {
    id: box.id,
    type: "architectureBox",
    position: viewState.boxPositions?.[box.id] ?? createDefaultPosition(),
    data,
  };
}

function createChildNode(
  node: ArchitectureNode,
  schemaIndex: SchemaIndex,
  viewState: ArchitectureViewState,
  boxById: Map<ArchitectureId, ArchitectureBox>
): ReactFlowNode {
  const nodeKind = schemaIndex.nodeKindsById.get(node.kind);
  const box = boxById.get(node.boxId);
  const boxKind = box ? schemaIndex.boxKindsById.get(box.kind) : undefined;
  const slotId = node.slot ?? nodeKind?.defaultSlot;
  const slot =
    slotId && boxKind ? schemaIndex.slotsByBoxKindId.get(boxKind.id)?.get(slotId) : undefined;
  const data: ReactFlowNodeData = {
    entity: "node",
    node,
  };

  if (nodeKind !== undefined) {
    data.nodeKind = nodeKind;
  }

  if (slot !== undefined) {
    data.slot = slot;
  }

  if (nodeKind?.renderAs !== undefined) {
    data.renderAs = nodeKind.renderAs;
  }

  return {
    id: node.id,
    type: "architectureNode",
    position: viewState.nodePositions?.[node.id] ?? createDefaultPosition(),
    parentId: node.boxId,
    extent: "parent",
    data,
  };
}

function createDefaultPosition() {
  return { x: 0, y: 0 };
}

function readEdgeHandle(
  metadata: ArchitectureEdge["metadata"],
  key: "sourceHandle" | "targetHandle"
): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" ? value : undefined;
}
