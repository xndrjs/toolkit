import type {
  ArchitectureBox,
  ArchitectureId,
  ArchitectureNode,
  BoxKindDefinition,
  LaneDefinition,
  NodeKindDefinition,
} from "../graph/types";

export function getSortedSlotIds(boxKind: BoxKindDefinition): string[] {
  return [...boxKind.slots]
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
    .map((slot) => slot.id);
}

export function isFrontierSlot(boxKind: BoxKindDefinition, slotId: string | undefined): boolean {
  if (slotId === undefined) {
    return false;
  }

  const sortedSlotIds = getSortedSlotIds(boxKind);
  if (sortedSlotIds.length === 0) {
    return true;
  }

  if (sortedSlotIds.length === 1) {
    return sortedSlotIds[0] === slotId;
  }

  return slotId === sortedSlotIds[0] || slotId === sortedSlotIds[sortedSlotIds.length - 1];
}

export function resolveNodeSlotId(
  node: ArchitectureNode,
  nodeKindsById: Map<string, NodeKindDefinition>
): string | undefined {
  return node.slot ?? nodeKindsById.get(node.kind)?.defaultSlot;
}

export function resolveEndpointBoxId(
  endpointId: ArchitectureId,
  nodeById: Map<ArchitectureId, ArchitectureNode>,
  boxById: Map<ArchitectureId, ArchitectureBox>
): ArchitectureId | undefined {
  const node = nodeById.get(endpointId);
  if (node) {
    return node.boxId;
  }

  return boxById.get(endpointId)?.id;
}

export function pickBoxBoundaryHandle(
  box: ArchitectureBox,
  otherBoxId: ArchitectureId | undefined,
  side: "source" | "target",
  lanesById: Map<string, LaneDefinition>,
  boxById: Map<ArchitectureId, ArchitectureBox>
): string {
  const boxLaneOrder = lanesById.get(box.laneId)?.order ?? 0;
  const otherBox = otherBoxId ? boxById.get(otherBoxId) : undefined;
  const otherLaneOrder = otherBox
    ? (lanesById.get(otherBox.laneId)?.order ?? boxLaneOrder)
    : boxLaneOrder;
  const otherIsLeft = otherLaneOrder < boxLaneOrder;

  if (side === "target") {
    return otherIsLeft ? "target-left" : "target-right";
  }

  return otherIsLeft ? "source-left" : "source-right";
}
