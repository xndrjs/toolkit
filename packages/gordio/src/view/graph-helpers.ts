import { createEdgeKey } from "../graph/create-edge-key";
import type { ArchitectureGraph, ArchitectureId, EdgeKey } from "../graph/types";

export interface DirectNeighboursResult {
  neighbourIds: Set<ArchitectureId>;
  edgeKeys: Set<EdgeKey>;
}

export function getDirectNeighbours(
  graph: ArchitectureGraph,
  nodeId: ArchitectureId
): DirectNeighboursResult {
  const neighbourIds = new Set<ArchitectureId>();
  const edgeKeys = new Set<EdgeKey>();

  for (const edge of graph.edges) {
    if (edge.sourceId === nodeId) {
      neighbourIds.add(edge.targetId);
      edgeKeys.add(createEdgeKey(edge));
    }

    if (edge.targetId === nodeId) {
      neighbourIds.add(edge.sourceId);
      edgeKeys.add(createEdgeKey(edge));
    }
  }

  return { neighbourIds, edgeKeys };
}

export function getBoxesForNodes(
  graph: ArchitectureGraph,
  endpointIds: Iterable<ArchitectureId>
): Set<ArchitectureId> {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const boxIds = new Set(graph.boxes.map((box) => box.id));
  const reachableBoxIds = new Set<ArchitectureId>();

  for (const endpointId of endpointIds) {
    if (boxIds.has(endpointId)) {
      reachableBoxIds.add(endpointId);
      continue;
    }

    const boxId = nodeById.get(endpointId)?.boxId;
    if (boxId !== undefined) {
      reachableBoxIds.add(boxId);
    }
  }

  return reachableBoxIds;
}
