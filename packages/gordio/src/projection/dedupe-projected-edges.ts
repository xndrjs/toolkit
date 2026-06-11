import type { EdgeKey } from "../graph/types";
import type { ReactFlowEdge } from "./types";

export function createProjectedEdgeVisualKey(
  edge: Pick<ReactFlowEdge, "source" | "target" | "sourceHandle" | "targetHandle">
): string {
  return JSON.stringify([
    edge.source,
    edge.sourceHandle ?? null,
    edge.target,
    edge.targetHandle ?? null,
  ]);
}

export function dedupeProjectedEdges(edges: ReactFlowEdge[]): ReactFlowEdge[] {
  const groups = new Map<string, ReactFlowEdge[]>();

  for (const edge of edges) {
    const key = createProjectedEdgeVisualKey(edge);
    const group = groups.get(key) ?? [];
    group.push(edge);
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => mergeProjectedEdgeGroup(group));
}

function mergeProjectedEdgeGroup(edges: ReactFlowEdge[]): ReactFlowEdge {
  const primary = pickPrimaryProjectedEdge(edges);
  const architectureEdgeKeys = edges.map((edge) => edge.id as EdgeKey);

  return {
    ...primary,
    id: createProjectedEdgeVisualKey(primary),
    data: {
      ...primary.data,
      architectureEdgeKeys,
    },
  };
}

function pickPrimaryProjectedEdge(edges: ReactFlowEdge[]): ReactFlowEdge {
  return edges.find((edge) => edge.data.kind === "opens") ?? edges[0]!;
}
