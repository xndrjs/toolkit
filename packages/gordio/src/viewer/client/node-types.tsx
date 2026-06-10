import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import type { ViewerNodeData } from "./types";

export const nodeTypes = {
  architectureBox: ArchitectureBoxNode,
  architectureNode: ArchitectureNode,
};

function ArchitectureBoxNode({ data }: NodeProps<Node<ViewerNodeData>>) {
  const box = data.box;

  return (
    <section className="gordio-box-node">
      <Handle type="target" position={Position.Left} />
      <div className="gordio-box-title">{box?.title ?? "Untitled box"}</div>
      <div className="gordio-box-meta">{box?.packageName}</div>
      <Handle type="source" position={Position.Right} />
    </section>
  );
}

function ArchitectureNode({ data }: NodeProps<Node<ViewerNodeData>>) {
  const node = data.node;
  const className =
    data.renderAs === "signature" ? "gordio-child-node signature" : "gordio-child-node";

  return (
    <article className={className}>
      <Handle type="target" position={Position.Left} />
      <strong>{node?.title ?? "Untitled node"}</strong>
      <span>{node?.kind}</span>
      <Handle type="source" position={Position.Right} />
    </article>
  );
}
