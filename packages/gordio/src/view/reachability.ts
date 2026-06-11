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

export function computeCompositionReachability(
  graph: ArchitectureGraph,
  startNodeId: ArchitectureId,
  mode: ReachabilityMode = "downstream"
): ReachabilityResult {
  const boxIds = new Set(graph.boxes.map((box) => box.id));
  const useCaseIdsByBoxId = new Map<ArchitectureId, ArchitectureId[]>();

  for (const node of graph.nodes) {
    if (node.kind !== "use-case") {
      continue;
    }

    const useCaseIds = useCaseIdsByBoxId.get(node.boxId) ?? [];
    useCaseIds.push(node.id);
    useCaseIdsByBoxId.set(node.boxId, useCaseIds);
  }

  const reachableNodeIds = new Set<ArchitectureId>([startNodeId]);
  const pathEdgeKeys = new Set<EdgeKey>();
  const queue = [startNodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const edge of graph.edges) {
      for (const [fromId, toId] of getEdgeTransitions(edge, mode)) {
        if (fromId !== current) {
          continue;
        }

        const edgeKey = createEdgeKey(edge);

        if (boxIds.has(toId)) {
          if (!reachableNodeIds.has(toId)) {
            reachableNodeIds.add(toId);
          }

          pathEdgeKeys.add(edgeKey);

          for (const useCaseId of useCaseIdsByBoxId.get(toId) ?? []) {
            if (reachableNodeIds.has(useCaseId)) {
              continue;
            }

            reachableNodeIds.add(useCaseId);
            queue.push(useCaseId);
          }

          continue;
        }

        if (reachableNodeIds.has(toId)) {
          continue;
        }

        reachableNodeIds.add(toId);
        pathEdgeKeys.add(edgeKey);
        queue.push(toId);
      }
    }
  }

  includeConnectedModels(graph, reachableNodeIds);

  return { reachableNodeIds, pathEdgeKeys };
}

function includeConnectedModels(
  graph: ArchitectureGraph,
  reachableNodeIds: Set<ArchitectureId>
): void {
  let changed = true;

  while (changed) {
    changed = false;

    for (const node of graph.nodes) {
      if (node.kind !== "model" || reachableNodeIds.has(node.id)) {
        continue;
      }

      for (const edge of graph.edges) {
        if (edge.sourceId !== node.id && edge.targetId !== node.id) {
          continue;
        }

        const otherEndpointId = edge.sourceId === node.id ? edge.targetId : edge.sourceId;
        if (!reachableNodeIds.has(otherEndpointId)) {
          continue;
        }

        reachableNodeIds.add(node.id);
        changed = true;
        break;
      }
    }
  }
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
