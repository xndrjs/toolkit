import type { Edge, Node } from "@xyflow/react";

import type { ArchitectureViewState, ReactFlowGraph, VisualState } from "../../projection/types";
import { resolveVisualState } from "../../view/state";
import { getBoxHeight, getBoxWidth, getCollapsedBoxHeight, getNodeWidth } from "./layout-metrics";
import type { ViewerEdgeData, ViewerNodeData } from "./types";
import {
  edgeOpacity,
  edgeStrokeColor,
  edgeStrokeDasharray,
  edgeStrokeWidth,
  visualStateClass,
} from "./visual-styles";

export function toViewerNodes(
  projection: ReactFlowGraph,
  viewState: ArchitectureViewState
): Node<ViewerNodeData>[] {
  return projection.nodes.map((node) => {
    const visualKind = node.data.entity === "box" ? "boxes" : "nodes";
    const visualState = resolveVisualState(viewState, visualKind, node.id);
    const flowNode: Node<ViewerNodeData> = {
      id: node.id,
      type: node.type,
      position: node.position,
      data: {
        ...(node.data as ViewerNodeData),
        visualState,
      },
      draggable: false,
      style:
        node.data.entity === "box"
          ? {
              width: node.data.width ?? getBoxWidth(node.id, projection),
              height: node.data.collapsed
                ? getCollapsedBoxHeight({ hasPackageName: Boolean(node.data.box?.packageName) })
                : (node.data.height ?? getBoxHeight(node.id, projection)),
            }
          : { width: getNodeWidth(node.data.node?.title ?? "") },
    };
    const className = visualStateClass(visualState);

    if (className !== undefined) {
      flowNode.className = className;
    }

    if (node.parentId !== undefined) {
      flowNode.parentId = node.parentId;
    }

    if (node.extent !== undefined) {
      flowNode.extent = node.extent;
    }

    return flowNode;
  });
}

const VISUAL_STATE_RANK: Record<VisualState, number> = {
  muted: 0,
  normal: 1,
  highlighted: 2,
};

function resolveProjectedEdgeVisualState(
  viewState: ArchitectureViewState,
  edge: ReactFlowGraph["edges"][number]
): VisualState {
  const architectureEdgeKeys = edge.data.architectureEdgeKeys ?? [edge.id];
  let visualState: VisualState = "muted";

  for (const edgeKey of architectureEdgeKeys) {
    const candidate = resolveVisualState(viewState, "edges", edgeKey);
    if (VISUAL_STATE_RANK[candidate] > VISUAL_STATE_RANK[visualState]) {
      visualState = candidate;
    }
  }

  return visualState;
}

function edgeZIndex(visualState: VisualState): number {
  switch (visualState) {
    case "highlighted":
      return 3;
    case "muted":
      return 2;
    default:
      return 1;
  }
}

export function toViewerEdges(
  projection: ReactFlowGraph,
  viewState: ArchitectureViewState
): Edge<ViewerEdgeData>[] {
  return projection.edges
    .map((edge) => {
      const visualState = resolveProjectedEdgeVisualState(viewState, edge);

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle ?? "source-right",
        targetHandle: edge.targetHandle ?? "target-left",
        animated: false,
        type: "default",
        zIndex: edgeZIndex(visualState),
        data: edge.data as ViewerEdgeData,
        style: {
          stroke: edgeStrokeColor(visualState, edge.data.kind),
          strokeWidth: edgeStrokeWidth(visualState),
          strokeDasharray: edgeStrokeDasharray(),
          opacity: edgeOpacity(visualState, edge.data.rerouted),
        },
      };
    })
    .sort((left, right) => (left.zIndex ?? 0) - (right.zIndex ?? 0));
}
