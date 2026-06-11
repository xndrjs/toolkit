import { getDirectNeighbours } from "../graph-helpers";
import { createMutedDecoration } from "../state";
import type { ArchitecturePolicy } from "../types";

export const directNeighbourPolicy: ArchitecturePolicy = ({ graph, event }) => {
  if (event.type !== "select-node") {
    return {};
  }

  const nodeExists = graph.nodes.some((node) => node.id === event.nodeId);
  if (!nodeExists) {
    return { selectedId: null, ...createMutedDecoration(graph) };
  }

  const { neighbourIds } = getDirectNeighbours(graph, event.nodeId);
  const highlightedNodeIds = new Set([event.nodeId, ...neighbourIds]);
  const patch = createMutedDecoration(graph);

  patch.selectedId = event.nodeId;

  for (const nodeId of highlightedNodeIds) {
    patch.nodes![nodeId] = "highlighted";
  }

  return patch;
};
