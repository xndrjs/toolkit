import type { ArchitectureGraph, ArchitectureId, ArchitectureViewSchema } from "../../graph/types";
import type { ArchitectureViewState, VisualState } from "../../projection/types";
import { getDirectNeighbours } from "../graph-helpers";
import type { ArchitecturePolicy, DecorationPatch } from "../types";
import { buildCompositionReachabilityPatch } from "./composition-reachability";

export const directNeighbourPolicy: ArchitecturePolicy = ({ graph, schema, viewState, event }) => {
  if (event.type !== "select-node") {
    return {};
  }

  const nodeExists = graph.nodes.some((node) => node.id === event.nodeId);
  if (!nodeExists) {
    return { selectedId: null };
  }

  if (viewState.selectedId === event.nodeId) {
    return buildNodeDeselectionPatch(graph, schema, viewState);
  }

  const decorationActive = isDecorationActive(viewState);
  const baselineState = (nodeId: ArchitectureId) =>
    resolveBaselineNodeState(viewState, nodeId, decorationActive, viewState.compositionRootId);

  if (baselineState(event.nodeId) !== "normal") {
    return {};
  }

  const { neighbourIds } = getDirectNeighbours(graph, event.nodeId);
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const highlightedNodeIds = new Set<ArchitectureId>([event.nodeId]);

  for (const neighbourId of neighbourIds) {
    if (nodeIds.has(neighbourId) && baselineState(neighbourId) === "normal") {
      highlightedNodeIds.add(neighbourId);
    }
  }

  const patch: DecorationPatch = {
    selectedId: event.nodeId,
    nodes: {},
  };

  for (const node of graph.nodes) {
    if (node.id === viewState.compositionRootId) {
      patch.nodes![node.id] = "highlighted";
      continue;
    }

    patch.nodes![node.id] = highlightedNodeIds.has(node.id)
      ? "highlighted"
      : baselineState(node.id);
  }

  return patch;
};

function buildNodeDeselectionPatch(
  graph: ArchitectureGraph,
  schema: ArchitectureViewSchema,
  viewState: ArchitectureViewState
): DecorationPatch {
  if (viewState.compositionRootId) {
    return {
      ...buildCompositionReachabilityPatch(graph, schema, viewState.compositionRootId),
      selectedId: viewState.compositionRootId,
      compositionRootId: viewState.compositionRootId,
    };
  }

  return {
    selectedId: null,
    nodes: Object.fromEntries(graph.nodes.map((node) => [node.id, "normal" as const])),
  };
}

function isDecorationActive(viewState: ArchitectureViewState): boolean {
  return Object.keys(viewState.visual?.nodes ?? {}).length > 0;
}

function resolveBaselineNodeState(
  viewState: ArchitectureViewState,
  nodeId: ArchitectureId,
  decorationActive: boolean,
  compositionRootId?: ArchitectureId
): VisualState {
  if (compositionRootId && nodeId === compositionRootId) {
    return "highlighted";
  }

  const current = viewState.visual?.nodes[nodeId] ?? (decorationActive ? "muted" : "normal");

  if (current === "highlighted") {
    return "normal";
  }

  return current;
}
