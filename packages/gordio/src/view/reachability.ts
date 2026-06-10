import { createEdgeKey } from "../graph/create-edge-key";
import type { ArchitectureEdge, ArchitectureGraph, ArchitectureId, EdgeKey } from "../graph/types";
import type { ReachabilityMode } from "./types";

export interface ReachabilityResult {
  reachableNodeIds: Set<ArchitectureId>;
  pathEdgeKeys: Set<EdgeKey>;
}

export function computeReachability(
  graph: ArchitectureGraph,
  startNodeId: ArchitectureId,
  mode: ReachabilityMode = "downstream"
): ReachabilityResult {
  const reachableNodeIds = new Set<ArchitectureId>([startNodeId]);
  const pathEdgeKeys = new Set<EdgeKey>();
  const queue = [startNodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const edge of graph.edges) {
      for (const [fromId, toId] of getEdgeTransitions(edge, mode)) {
        if (fromId !== current || reachableNodeIds.has(toId)) {
          continue;
        }

        reachableNodeIds.add(toId);
        pathEdgeKeys.add(createEdgeKey(edge));
        queue.push(toId);
      }
    }
  }

  return { reachableNodeIds, pathEdgeKeys };
}

function getEdgeTransitions(
  edge: ArchitectureEdge,
  mode: ReachabilityMode
): [ArchitectureId, ArchitectureId][] {
  const { sourceId, targetId } = edge;
  const isDirected = edge.directed === true;

  switch (mode) {
    case "undirected":
      return [
        [sourceId, targetId],
        [targetId, sourceId],
      ];
    case "directed":
      return isDirected
        ? [[sourceId, targetId]]
        : [
            [sourceId, targetId],
            [targetId, sourceId],
          ];
    case "downstream":
      return isDirected
        ? [[sourceId, targetId]]
        : [
            [sourceId, targetId],
            [targetId, sourceId],
          ];
    case "upstream":
      return isDirected
        ? [[targetId, sourceId]]
        : [
            [sourceId, targetId],
            [targetId, sourceId],
          ];
  }
}
