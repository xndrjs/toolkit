import type {
  ArchitectureGraph,
  ArchitectureId,
  ArchitectureNode,
  ArchitectureViewSchema,
  BoxKindDefinition,
  NodeKindDefinition,
} from "../graph/types";

export interface SlotIndex {
  boxIds: Set<ArchitectureId>;
  resolveNodeSlotId(node: ArchitectureNode): string;
  getNodesInSlots(slotIds: readonly string[]): Set<ArchitectureId>;
}

export function createSlotIndex(
  graph: ArchitectureGraph,
  schema: ArchitectureViewSchema
): SlotIndex {
  const nodeKindsById = new Map(schema.nodeKinds.map((nodeKind) => [nodeKind.id, nodeKind]));
  const boxKindsById = new Map(schema.boxKinds.map((boxKind) => [boxKind.id, boxKind]));
  const boxesById = new Map(graph.boxes.map((box) => [box.id, box]));
  const boxIds = new Set(graph.boxes.map((box) => box.id));

  return {
    boxIds,
    resolveNodeSlotId: (node) => resolveNodeSlotId(node, boxesById, boxKindsById, nodeKindsById),
    getNodesInSlots: (slotIds) => {
      const slotIdSet = new Set(slotIds);
      const nodeIds = new Set<ArchitectureId>();

      for (const node of graph.nodes) {
        if (slotIdSet.has(resolveNodeSlotId(node, boxesById, boxKindsById, nodeKindsById))) {
          nodeIds.add(node.id);
        }
      }

      return nodeIds;
    },
  };
}

function resolveNodeSlotId(
  node: ArchitectureNode,
  boxesById: Map<ArchitectureId, ArchitectureGraph["boxes"][number]>,
  boxKindsById: Map<string, BoxKindDefinition>,
  nodeKindsById: Map<string, NodeKindDefinition>
): string {
  const box = boxesById.get(node.boxId);
  const boxKind = box ? boxKindsById.get(box.kind) : undefined;
  const nodeKind = nodeKindsById.get(node.kind);
  const slotId = node.slot ?? nodeKind?.defaultSlot;
  const slot = boxKind?.slots.find((candidate) => candidate.id === slotId);

  return slot?.id ?? slotId ?? "default";
}
