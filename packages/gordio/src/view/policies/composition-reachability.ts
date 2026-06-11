import type { ArchitectureGraph, ArchitectureId, ArchitectureViewSchema } from "../../graph/types";
import { cleanArchitectureLayeredReachability } from "../../presets/clean-architecture-layered-reachability";
import { getBoxesForNodes } from "../graph-helpers";
import { computeLayeredReachability } from "../layered-reachability";
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

  const { activeNodeIds, openedBoxIds } = computeLayeredReachability(
    graph,
    schema,
    event.nodeId,
    cleanArchitectureLayeredReachability
  );
  const patch = createMutedDecoration(graph);

  patch.selectedId = event.nodeId;
  patch.collapsedBoxes = createCollapsePatch(graph, schema, openedBoxIds, activeNodeIds);
  patch.nodes![event.nodeId] = "highlighted";

  for (const node of graph.nodes) {
    if (activeNodeIds.has(node.id) && node.id !== event.nodeId) {
      patch.nodes![node.id] = "normal";
    }
  }

  applyCompositionAppScope(graph, schema, event.nodeId, patch);

  return patch;
};

function applyCompositionAppScope(
  graph: ArchitectureGraph,
  schema: ArchitectureViewSchema,
  selectedRootId: ArchitectureId,
  patch: DecorationPatch
): void {
  const selectedRoot = graph.nodes.find((node) => node.id === selectedRootId);
  if (!selectedRoot) {
    return;
  }

  const appBoxKindIds = new Set(
    schema.boxKinds.filter((boxKind) => boxKind.id === "app").map((boxKind) => boxKind.id)
  );
  const boxesById = new Map(graph.boxes.map((box) => [box.id, box]));

  for (const node of graph.nodes) {
    if (node.kind === "composition-root" && node.id !== selectedRootId) {
      patch.nodes![node.id] = "muted";
    }

    const box = boxesById.get(node.boxId);
    if (box && appBoxKindIds.has(box.kind) && node.boxId !== selectedRoot.boxId) {
      patch.nodes![node.id] = "muted";
    }
  }
}

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
