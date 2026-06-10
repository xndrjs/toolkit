import type { Edge, Node } from "@xyflow/react";

import type { ReactFlowGraph } from "../../projection/types";
import { getBoxWidth, getNodeWidth } from "./layout-metrics";
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
              width: getBoxWidth(node.id, projection),
              height: Math.max(
                180,
                projection.nodes.filter((candidate) => candidate.parentId === node.id).length * 54 +
                  86
              ),
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
    animated: edge.animated,
    type: "smoothstep",
    data: edge.data as ViewerEdgeData,
    style: {
      stroke: edge.data.kind === "implements" ? "#9a6bdb" : "#5a7ccf",
      strokeWidth: 2,
      opacity: edge.data.rerouted ? 0.55 : 0.9,
    },
  }));
}
