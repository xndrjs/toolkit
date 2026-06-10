import { createEdgeKey } from "../../graph/create-edge-key";
import type { ArchitecturePolicy } from "../types";

export const toggleBoxCollapsePolicy: ArchitecturePolicy = ({
  graph,
  schema,
  viewState,
  event,
}) => {
  if (event.type !== "toggle-box-collapse") {
    return {};
  }

  const box = graph.boxes.find((candidate) => candidate.id === event.boxId);
  if (!box) {
    return {};
  }

  const explicit = viewState.collapsedBoxes?.[event.boxId];
  const defaultCollapsed =
    schema.boxKinds.find((boxKind) => boxKind.id === box.kind)?.defaultCollapsed === true;
  const current = explicit ?? defaultCollapsed ?? false;

  return {
    collapsedBoxes: {
      [event.boxId]: !current,
    },
  };
};

export const clearSelectionPolicy: ArchitecturePolicy = ({ graph, event }) => {
  if (event.type !== "clear-selection") {
    return {};
  }

  return {
    selectedId: null,
    boxes: Object.fromEntries(graph.boxes.map((box) => [box.id, "normal" as const])),
    nodes: Object.fromEntries(graph.nodes.map((node) => [node.id, "normal" as const])),
    edges: Object.fromEntries(graph.edges.map((edge) => [createEdgeKey(edge), "normal" as const])),
  };
};
