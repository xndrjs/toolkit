import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import type { ViewerNodeData } from "./types";
import { visualStateClass } from "./visual-styles";

export const nodeTypes = {
  architectureBox: ArchitectureBoxNode,
  architectureNode: ArchitectureNode,
};

function ArchitectureBoxNode({ data }: NodeProps<Node<ViewerNodeData>>) {
  const box = data.box;
  const collapsed = data.collapsed === true;
  const visualClass = visualStateClass(data.visualState ?? "normal");

  return (
    <section
      className={["gordio-box-node", collapsed ? "collapsed" : "", visualClass ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      <Handle id="target-left" type="target" position={Position.Left} />
      <header className="gordio-box-header">
        <div className="gordio-box-heading">
          <div className="gordio-box-title">{box?.title ?? "Untitled box"}</div>
          {box?.packageName ? <div className="gordio-box-meta">{box.packageName}</div> : null}
        </div>
      </header>
      <Handle id="source-right" type="source" position={Position.Right} />
    </section>
  );
}

function ArchitectureNode({ data }: NodeProps<Node<ViewerNodeData>>) {
  const node = data.node;
  const visualClass = visualStateClass(data.visualState ?? "normal");
  const className = [
    data.renderAs === "signature" ? "gordio-child-node signature" : "gordio-child-node",
    visualClass ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={className}>
      <Handle id="target-left" type="target" position={Position.Left} />
      <Handle id="target-right" type="target" position={Position.Right} />
      <strong>{node?.title ?? "Untitled node"}</strong>
      <span>{node?.kind}</span>
      <Handle id="source-left" type="source" position={Position.Left} />
      <Handle id="source-right" type="source" position={Position.Right} />
    </article>
  );
}
