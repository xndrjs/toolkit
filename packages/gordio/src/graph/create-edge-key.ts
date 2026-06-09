import type { ArchitectureEdge, EdgeKey } from "./types";

export function createEdgeKey(edge: ArchitectureEdge): EdgeKey {
  const direction = edge.directed === true ? "directed" : "undirected";
  const endpoints =
    direction === "directed"
      ? [edge.sourceId, edge.targetId]
      : [edge.sourceId, edge.targetId].sort();

  return JSON.stringify(["edge", direction, edge.kind ?? null, endpoints[0], endpoints[1]]);
}
