import type { ArchitectureGraph, ArchitectureId } from "../../graph/types";
import { cleanArchitectureLayeredReachability } from "../../presets/clean-architecture-layered-reachability";
import { getBoxesForNodes } from "../graph-helpers";
import { computeLayeredReachability } from "../layered-reachability";
import { createMutedDecoration } from "../state";
import type { ArchitecturePolicy } from "../types";

export const compositionReachabilityPolicy: ArchitecturePolicy = ({ graph, schema, event }) => {
  if (event.type !== "select-composition-root") {
    return {};
  }

  const compositionRoot = graph.nodes.find((node) => node.id === event.nodeId);
  if (!compositionRoot || compositionRoot.kind !== "composition-root") {
    return { selectedId: null, ...createMutedDecoration(graph) };
  }

  const { activeNodeIds, openedBoxIds } = computeLayeredReachability(
    graph,
    schema,
    event.nodeId,
    cleanArchitectureLayeredReachability
  );
  const patch = createMutedDecoration(graph);
  const normalNodeIds = new Set<ArchitectureId>();

  patch.selectedId = event.nodeId;
  patch.collapsedBoxes = createCollapsePatch(graph, schema, openedBoxIds, activeNodeIds);
  patch.nodes![event.nodeId] = "highlighted";

  for (const node of graph.nodes) {
    if (activeNodeIds.has(node.id) && node.id !== event.nodeId) {
      patch.nodes![node.id] = "normal";
      normalNodeIds.add(node.id);
    }
  }

  return patch;
};

function createCollapsePatch(
  graph: ArchitectureGraph,
  schema: { boxKinds: { id: string }[] },
  openedBoxIds: Set<ArchitectureId>,
  activeNodeIds: Set<ArchitectureId>
): Record<ArchitectureId, boolean> {
  const appBoxKindIds = new Set(
    schema.boxKinds.filter((boxKind) => boxKind.id === "app").map((boxKind) => boxKind.id)
  );
  const boxesWithActiveChildren = getBoxesForNodes(graph, activeNodeIds);
  const collapsedBoxes: Record<ArchitectureId, boolean> = {};

  for (const box of graph.boxes) {
    if (appBoxKindIds.has(box.kind)) {
      collapsedBoxes[box.id] = false;
      continue;
    }

    const shouldExpand = openedBoxIds.has(box.id) || boxesWithActiveChildren.has(box.id);
    collapsedBoxes[box.id] = !shouldExpand;
  }

  return collapsedBoxes;
}
