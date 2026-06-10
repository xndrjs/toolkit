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
  nodeIds: Iterable<ArchitectureId>
): Set<ArchitectureId> {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const boxIds = new Set<ArchitectureId>();

  for (const nodeId of nodeIds) {
    const boxId = nodeById.get(nodeId)?.boxId;
    if (boxId !== undefined) {
      boxIds.add(boxId);
    }
  }

  return boxIds;
}
