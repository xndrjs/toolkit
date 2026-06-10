import { Background, Controls, ReactFlow, ReactFlowProvider } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { toReactFlowGraph } from "../../projection/to-react-flow-graph";
import type { ArchitectureViewState } from "../../projection/types";
import { applyArchitecturePolicies } from "../../view/policies/index";
import { loadViewerPayload } from "./load-viewer-payload";
import { nodeTypes } from "./node-types";
import { toViewerEdges, toViewerNodes } from "./react-flow-adapter";
import type { ViewerPayload, ViewerStatus } from "./types";
import { ViewerFrame } from "./ViewerFrame";
import { ViewerInteractionProvider } from "./viewer-interaction-context";

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
  const projection = useMemo(
    () =>
      toReactFlowGraph({
        graph: graphDocument.graph,
        schema,
        viewState,
      }),
    [graphDocument.graph, schema, viewState]
  );
  const nodes = useMemo(() => toViewerNodes(projection), [projection]);
  const edges = useMemo(() => toViewerEdges(projection), [projection]);
  const toggleBoxCollapse = useCallback(
    (boxId: string) => {
      setViewState((current) =>
        applyArchitecturePolicies({
          graph: graphDocument.graph,
          schema,
          viewState: current,
          event: { type: "toggle-box-collapse", boxId },
        })
      );
    },
    [graphDocument.graph, schema]
  );
  const summary = [
    `${graphDocument.graph.boxes.length} boxes`,
    `${graphDocument.graph.nodes.length} nodes`,
    `${graphDocument.graph.edges.length} edges`,
  ].join(" | ");

  return (
    <ViewerFrame summary={summary}>
      <ViewerInteractionProvider toggleBoxCollapse={toggleBoxCollapse}>
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
      </ViewerInteractionProvider>
    </ViewerFrame>
  );
}
