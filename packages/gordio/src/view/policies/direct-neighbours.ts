import type { ArchitectureGraph, ArchitectureId } from "../../graph/types";
import { getBoxesForNodes, getDirectNeighbours } from "../graph-helpers";
import { createMutedDecoration } from "../state";
import type { ArchitecturePolicy, DecorationPatch } from "../types";

export const directNeighbourPolicy: ArchitecturePolicy = ({ graph, event }) => {
  if (event.type !== "select-node") {
    return {};
  }

  const nodeExists = graph.nodes.some((node) => node.id === event.nodeId);
  if (!nodeExists) {
    return { selectedId: null, ...createMutedDecoration(graph) };
  }

  const { neighbourIds, edgeKeys } = getDirectNeighbours(graph, event.nodeId);
  const highlightedNodeIds = new Set<ArchitectureId>([event.nodeId, ...neighbourIds]);
  const visibleBoxIds = getBoxesForNodes(graph, highlightedNodeIds);
  const patch = createMutedDecoration(graph);

  patch.selectedId = event.nodeId;

  for (const nodeId of highlightedNodeIds) {
    patch.nodes![nodeId] = "highlighted";
  }

  for (const edgeKey of edgeKeys) {
    patch.edges![edgeKey] = "highlighted";
  }

  for (const boxId of visibleBoxIds) {
    patch.boxes![boxId] = "normal";
  }

  return patch;
};
