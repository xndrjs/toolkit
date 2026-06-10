import { createEdgeKey } from "../graph/create-edge-key";
import type {
  ArchitectureBox,
  ArchitectureId,
  ArchitectureNode,
  ArchitectureViewSchema,
  BoxKindDefinition,
  LaneDefinition,
  NodeKindDefinition,
  SlotDefinition,
} from "../graph/types";
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

  return {
    nodes: [...boxNodes, ...childNodes],
    edges: graph.edges.flatMap((edge): ReactFlowEdge[] => {
      const source = getProjectedEndpoint(edge.sourceId, nodeById, collapsedBoxIds, boxById);
      const target = getProjectedEndpoint(edge.targetId, nodeById, collapsedBoxIds, boxById);

      if (!source || !target || source === target) {
        return [];
      }

      const id = createEdgeKey(edge);
      const data: ReactFlowEdgeData = {
        edge,
        directed: edge.directed === true,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        rerouted: source !== edge.sourceId || target !== edge.targetId,
      };

      if (edge.kind !== undefined) {
        data.kind = edge.kind;
      }

      return [
        {
          id,
          source,
          target,
          type: "architectureEdge",
          animated: edge.directed === true,
          data,
        },
      ];
    }),
  };
}

interface SchemaIndex {
  lanesById: Map<string, LaneDefinition>;
  boxKindsById: Map<string, BoxKindDefinition>;
  nodeKindsById: Map<string, NodeKindDefinition>;
  slotsByBoxKindId: Map<string, Map<string, SlotDefinition>>;
}

function createSchemaIndex(schema: ArchitectureViewSchema): SchemaIndex {
  return {
    lanesById: new Map(schema.lanes.map((lane) => [lane.id, lane])),
    boxKindsById: new Map(schema.boxKinds.map((boxKind) => [boxKind.id, boxKind])),
    nodeKindsById: new Map(schema.nodeKinds.map((nodeKind) => [nodeKind.id, nodeKind])),
    slotsByBoxKindId: new Map(
      schema.boxKinds.map((boxKind) => [
        boxKind.id,
        new Map(boxKind.slots.map((slot) => [slot.id, slot])),
      ])
    ),
  };
}

function collectCollapsedBoxIds(
  boxes: ArchitectureBox[],
  boxKindsById: Map<string, BoxKindDefinition>,
  viewState: ArchitectureViewState
): Set<ArchitectureId> {
  const collapsedBoxIds = new Set<ArchitectureId>();

  for (const box of boxes) {
    if (boxKindsById.get(box.kind)?.defaultCollapsed === true) {
      collapsedBoxIds.add(box.id);
    }
  }

  for (const boxId of viewState.collapsedBoxIds ?? []) {
    collapsedBoxIds.add(boxId);
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

function getProjectedEndpoint(
  endpointId: ArchitectureId,
  nodeById: Map<ArchitectureId, ArchitectureNode>,
  collapsedBoxIds: Set<ArchitectureId>,
  boxById: Map<ArchitectureId, ArchitectureBox>
): ArchitectureId | undefined {
  const node = nodeById.get(endpointId);

  if (!node) {
    return boxById.get(endpointId)?.id;
  }

  if (!collapsedBoxIds.has(node.boxId)) {
    return node.id;
  }

  return boxById.get(node.boxId)?.id;
}

function createDefaultPosition() {
  return { x: 0, y: 0 };
}
