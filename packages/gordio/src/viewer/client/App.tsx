import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  type NodeMouseHandler,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { toReactFlowGraph } from "../../projection/to-react-flow-graph";
import type { ArchitectureViewState } from "../../projection/types";
import { applyArchitecturePolicies } from "../../view/policies/index";
import { loadViewerPayload } from "./load-viewer-payload";
import { nodeTypes } from "./node-types";
import { toViewerEdges, toViewerNodes } from "./react-flow-adapter";
import type { ViewerNodeData, ViewerPayload, ViewerStatus } from "./types";
import { ViewerFrame } from "./ViewerFrame";

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
  const { graphDocument, schema } = payload;
  const [viewState, setViewState] = useState<ArchitectureViewState>(payload.viewState);
  const applyPolicy = useCallback(
    (event: Parameters<typeof applyArchitecturePolicies>[0]["event"]) => {
      setViewState((current) =>
        applyArchitecturePolicies({
          graph: graphDocument.graph,
          schema,
          viewState: current,
          event,
        })
      );
    },
    [graphDocument.graph, schema]
  );
  const projection = useMemo(
    () =>
      toReactFlowGraph({
        graph: graphDocument.graph,
        schema,
        viewState,
      }),
    [graphDocument.graph, schema, viewState]
  );
  const nodes = useMemo(() => toViewerNodes(projection, viewState), [projection, viewState]);
  const edges = useMemo(() => toViewerEdges(projection, viewState), [projection, viewState]);
  const handleNodeClick = useCallback<NodeMouseHandler>(
    (_, node) => {
      if (node.type !== "architectureNode") {
        return;
      }

      const data = node.data as ViewerNodeData;
      if (!data.node) {
        return;
      }

      if (data.node.kind === "composition-root") {
        setViewState((current) =>
          applyArchitecturePolicies({
            graph: graphDocument.graph,
            schema,
            viewState: current,
            event:
              current.selectedId === data.node!.id
                ? { type: "clear-selection" }
                : { type: "select-composition-root", nodeId: data.node!.id },
          })
        );
        return;
      }

      applyPolicy({ type: "select-node", nodeId: data.node.id });
    },
    [applyPolicy, graphDocument.graph, schema]
  );
  const handlePaneClick = useCallback(() => {
    applyPolicy({ type: "clear-selection" });
  }, [applyPolicy]);
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
          zoomOnDoubleClick={false}
          nodeTypes={nodeTypes}
          nodes={nodes}
          edges={edges}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </ReactFlowProvider>
    </ViewerFrame>
  );
}
