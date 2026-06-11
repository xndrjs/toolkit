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
import {
  isFrontierSlot,
  pickBoxBoundaryHandle,
  resolveEndpointBoxId,
  resolveNodeSlotId,
} from "./box-frontier";

export interface ProjectedEndpoint {
  id: ArchitectureId;
  handle?: string;
  rerouted: boolean;
}

export interface ProjectVisualEndpointInput {
  endpointId: ArchitectureId;
  otherEndpointId: ArchitectureId;
  side: "source" | "target";
  nodeById: Map<ArchitectureId, ArchitectureNode>;
  boxById: Map<ArchitectureId, ArchitectureBox>;
  collapsedBoxIds: Set<ArchitectureId>;
  schemaIndex: SchemaIndex;
}

export interface SchemaIndex {
  lanesById: Map<string, LaneDefinition>;
  boxKindsById: Map<string, BoxKindDefinition>;
  nodeKindsById: Map<string, NodeKindDefinition>;
  slotsByBoxKindId: Map<string, Map<string, SlotDefinition>>;
}

export function createSchemaIndex(schema: ArchitectureViewSchema): SchemaIndex {
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

export function projectVisualEndpoint(
  input: ProjectVisualEndpointInput
): ProjectedEndpoint | undefined {
  const { endpointId, otherEndpointId, side, nodeById, boxById, collapsedBoxIds, schemaIndex } =
    input;
  const node = nodeById.get(endpointId);

  if (!node) {
    const box = boxById.get(endpointId);
    return box ? { id: box.id, rerouted: false } : undefined;
  }

  const box = boxById.get(node.boxId);
  if (!box) {
    return { id: node.id, rerouted: false };
  }

  const boxKind = schemaIndex.boxKindsById.get(box.kind);
  const otherBoxId = resolveEndpointBoxId(otherEndpointId, nodeById, boxById);

  if (collapsedBoxIds.has(node.boxId)) {
    return {
      id: box.id,
      handle: pickBoxBoundaryHandle(box, otherBoxId, side, schemaIndex.lanesById, boxById),
      rerouted: true,
    };
  }

  const slotId = resolveNodeSlotId(node, schemaIndex.nodeKindsById);
  if (!boxKind || isFrontierSlot(boxKind, slotId) || otherBoxId === node.boxId) {
    return { id: node.id, rerouted: false };
  }

  return {
    id: box.id,
    handle: pickBoxBoundaryHandle(box, otherBoxId, side, schemaIndex.lanesById, boxById),
    rerouted: true,
  };
}
