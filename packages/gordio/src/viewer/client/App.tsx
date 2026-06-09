import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { ArchitectureGraphDocument } from "../../config/define-config";
import type { ReactFlowEdgeData, ReactFlowGraph, ReactFlowNodeData } from "../../projection/types";

interface ViewerPayload {
  graphDocument: ArchitectureGraphDocument;
  projection: ReactFlowGraph;
}

type ViewerNodeData = ReactFlowNodeData & Record<string, unknown>;
type ViewerEdgeData = ReactFlowEdgeData & Record<string, unknown>;

type ViewerStatus =
  | { state: "loading" }
  | { state: "ready"; payload: ViewerPayload }
  | { state: "error"; message: string };

const nodeTypes = {
  architectureBox: ArchitectureBoxNode,
  architectureNode: ArchitectureNode,
};

export function App() {
  const [status, setStatus] = useState<ViewerStatus>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;

    loadViewerPayload()
      .then((payload) => {
        if (!cancelled) {
          setStatus({ state: "ready", payload });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setStatus({
            state: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (status.state === "loading") {
    return <ViewerFrame summary="Loading graph..." />;
  }

  if (status.state === "error") {
    return <ViewerFrame summary="Unable to load graph" detail={status.message} />;
  }

  return <ReadyViewer payload={status.payload} />;
}

function ReadyViewer({ payload }: { payload: ViewerPayload }) {
  const { graphDocument, projection } = payload;
  const nodes = useMemo<Node<ViewerNodeData>[]>(() => {
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
                width: 280,
                height: Math.max(
                  180,
                  projection.nodes.filter((candidate) => candidate.parentId === node.id).length *
                    54 +
                    86
                ),
              }
            : { width: 232 },
      };

      if (node.parentId !== undefined) {
        flowNode.parentId = node.parentId;
      }

      if (node.extent !== undefined) {
        flowNode.extent = node.extent;
      }

      return flowNode;
    });
  }, [projection.nodes]);
  const edges = useMemo<Edge<ViewerEdgeData>[]>(() => {
    return projection.edges.map((edge) => {
      const flowEdge: Edge<ViewerEdgeData> = {
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
      };

      if (edge.data.kind !== undefined) {
        flowEdge.label = edge.data.kind;
      }

      return flowEdge;
    });
  }, [projection.edges]);
  const summary = [
    `${graphDocument.graph.boxes.length} boxes`,
    `${graphDocument.graph.nodes.length} nodes`,
    `${graphDocument.graph.edges.length} edges`,
  ].join(" | ");

  return (
    <ViewerFrame summary={summary}>
      <ReactFlowProvider>
        <ReactFlow
          fitView
          nodeTypes={nodeTypes}
          nodes={nodes}
          edges={edges}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </ReactFlowProvider>
    </ViewerFrame>
  );
}

function ViewerFrame({
  children,
  detail,
  summary,
}: {
  children?: ReactNode;
  detail?: string;
  summary: string;
}) {
  return (
    <div className="gordio-viewer">
      <header className="gordio-header">
        <h1>Gordio Viewer</h1>
        <div className="gordio-summary">{summary}</div>
      </header>
      <main className="gordio-main">
        {detail ? <p className="gordio-message">{detail}</p> : null}
        {children ?? <div className="gordio-empty-canvas" />}
      </main>
    </div>
  );
}

function ArchitectureBoxNode({ data }: NodeProps<Node<ViewerNodeData>>) {
  const box = data.box;

  return (
    <section className="gordio-box-node">
      <Handle type="target" position={Position.Left} />
      <div className="gordio-box-title">{box?.title ?? "Untitled box"}</div>
      <div className="gordio-box-meta">{[box?.laneId, box?.kind].filter(Boolean).join(" / ")}</div>
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

async function loadViewerPayload(): Promise<ViewerPayload> {
  const [documentResponse, projectionResponse] = await Promise.all([
    fetch("/graph.json"),
    fetch("/projection.json"),
  ]);

  if (!documentResponse.ok) {
    throw new Error(`Failed to load graph document: ${documentResponse.status}`);
  }

  if (!projectionResponse.ok) {
    throw new Error(`Failed to load React Flow projection: ${projectionResponse.status}`);
  }

  return {
    graphDocument: (await documentResponse.json()) as ArchitectureGraphDocument,
    projection: (await projectionResponse.json()) as ReactFlowGraph,
  };
}
