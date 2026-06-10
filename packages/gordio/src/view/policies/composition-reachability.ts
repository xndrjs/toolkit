import type { ArchitectureGraph, ArchitectureId } from "../../graph/types";
import { getBoxesForNodes } from "../graph-helpers";
import { computeReachability } from "../reachability";
import { createMutedDecoration } from "../state";
import type { ArchitecturePolicy, DecorationPatch } from "../types";

export const compositionReachabilityPolicy: ArchitecturePolicy = ({ graph, schema, event }) => {
  if (event.type !== "select-composition-root") {
    return {};
  }

  const compositionRoot = graph.nodes.find((node) => node.id === event.nodeId);
  if (!compositionRoot || compositionRoot.kind !== "composition-root") {
    return { selectedId: null, ...createMutedDecoration(graph) };
  }

  const mode = event.mode ?? "downstream";
  const { reachableNodeIds, pathEdgeKeys } = computeReachability(graph, event.nodeId, mode);
  const reachableBoxIds = getBoxesForNodes(graph, reachableNodeIds);
  const patch = createMutedDecoration(graph);

  patch.selectedId = event.nodeId;
  patch.collapsedBoxes = createCollapsePatch(graph, schema, reachableBoxIds);

  patch.nodes![event.nodeId] = "highlighted";

  for (const node of graph.nodes) {
    if (reachableNodeIds.has(node.id) && node.id !== event.nodeId) {
      patch.nodes![node.id] = "normal";
    }
  }

  for (const edgeKey of pathEdgeKeys) {
    patch.edges![edgeKey] = "highlighted";
  }

  for (const boxId of reachableBoxIds) {
    patch.boxes![boxId] = "normal";
  }

  return patch;
};

function createCollapsePatch(
  graph: ArchitectureGraph,
  schema: { boxKinds: { id: string }[] },
  reachableBoxIds: Set<ArchitectureId>
): Record<ArchitectureId, boolean> {
  const appBoxKindIds = new Set(
    schema.boxKinds.filter((boxKind) => boxKind.id === "app").map((boxKind) => boxKind.id)
  );
  const collapsedBoxes: Record<ArchitectureId, boolean> = {};

  for (const box of graph.boxes) {
    if (appBoxKindIds.has(box.kind)) {
      collapsedBoxes[box.id] = false;
      continue;
    }

    collapsedBoxes[box.id] = !reachableBoxIds.has(box.id);
  }

  return collapsedBoxes;
}
