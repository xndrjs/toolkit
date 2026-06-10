import type { Edge, Node } from "@xyflow/react";

import type { ReactFlowGraph } from "../../projection/types";
import { getBoxHeight, getBoxWidth, getCollapsedBoxHeight, getNodeWidth } from "./layout-metrics";
import type { ViewerEdgeData, ViewerNodeData } from "./types";

export function toViewerNodes(projection: ReactFlowGraph): Node<ViewerNodeData>[] {
  return projection.nodes.map((node) => {
    const flowNode: Node<ViewerNodeData> = {
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data as ViewerNodeData,
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

    if (node.parentId !== undefined) {
      flowNode.parentId = node.parentId;
    }

    if (node.extent !== undefined) {
      flowNode.extent = node.extent;
    }

    return flowNode;
  });
}

export function toViewerEdges(projection: ReactFlowGraph): Edge<ViewerEdgeData>[] {
  return projection.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? "source-right",
    targetHandle: edge.targetHandle ?? "target-left",
    animated: edge.animated,
    type: "default",
    data: edge.data as ViewerEdgeData,
    style: {
      stroke: edge.data.kind === "implements" ? "#9a6bdb" : "#5a7ccf",
      strokeWidth: 2,
      opacity: edge.data.rerouted ? 0.55 : 0.9,
    },
  }));
}
