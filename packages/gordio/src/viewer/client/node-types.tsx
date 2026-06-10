import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import type { ViewerNodeData } from "./types";
import { useViewerInteraction } from "./viewer-interaction-context";

export const nodeTypes = {
  architectureBox: ArchitectureBoxNode,
  architectureNode: ArchitectureNode,
};

function ArchitectureBoxNode({ data }: NodeProps<Node<ViewerNodeData>>) {
  const box = data.box;
  const { toggleBoxCollapse } = useViewerInteraction();
  const collapsible = data.boxKind?.collapsible === true;
  const collapsed = data.collapsed === true;

  return (
    <section className={`gordio-box-node${collapsed ? " collapsed" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <header className="gordio-box-header">
        <div className="gordio-box-heading">
          <div className="gordio-box-title">{box?.title ?? "Untitled box"}</div>
          {box?.packageName ? <div className="gordio-box-meta">{box.packageName}</div> : null}
        </div>
        {collapsible ? (
          <button
            type="button"
            className="gordio-box-collapse-toggle"
            aria-label={collapsed ? "Expand box" : "Collapse box"}
            aria-expanded={!collapsed}
            onClick={(event) => {
              event.stopPropagation();
              if (box?.id) {
                toggleBoxCollapse(box.id);
              }
            }}
          >
            {collapsed ? "+" : "−"}
          </button>
        ) : null}
      </header>
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
