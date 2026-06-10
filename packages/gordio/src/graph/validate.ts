import { createEdgeKey } from "./create-edge-key";
import { ArchitectureGraphError } from "./errors";
import type { ArchitectureGraph } from "./types";

export function validateArchitectureGraph(graph: ArchitectureGraph): ArchitectureGraph {
  const issues: string[] = [];
  const boxIds = collectUniqueIds(
    graph.boxes.map((box) => box.id),
    "box",
    issues
  );
  const nodeIds = collectUniqueIds(
    graph.nodes.map((node) => node.id),
    "node",
    issues
  );
  const edgeKeys = new Set<string>();

  for (const node of graph.nodes) {
    if (!boxIds.has(node.boxId)) {
      issues.push(`Node "${node.id}" references missing box "${node.boxId}"`);
    }
  }

  for (const edge of graph.edges) {
    const key = createEdgeKey(edge);
    if (edgeKeys.has(key)) {
      issues.push(`Duplicate edge "${key}"`);
    }
    edgeKeys.add(key);

    if (!nodeIds.has(edge.sourceId) && !boxIds.has(edge.sourceId)) {
      issues.push(`Edge "${key}" references missing source endpoint "${edge.sourceId}"`);
    }

    if (!nodeIds.has(edge.targetId) && !boxIds.has(edge.targetId)) {
      issues.push(`Edge "${key}" references missing target endpoint "${edge.targetId}"`);
    }
  }

  if (issues.length > 0) {
    throw new ArchitectureGraphError(`Invalid architecture graph:\n- ${issues.join("\n- ")}`);
  }

  return graph;
}

function collectUniqueIds(ids: string[], entity: "box" | "node", issues: string[]): Set<string> {
  const uniqueIds = new Set<string>();

  for (const id of ids) {
    if (id.length === 0) {
      issues.push(`Empty ${entity} id`);
      continue;
    }

    if (uniqueIds.has(id)) {
      issues.push(`Duplicate ${entity} id "${id}"`);
    }

    uniqueIds.add(id);
  }

  return uniqueIds;
}
