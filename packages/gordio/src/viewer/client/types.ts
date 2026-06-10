import type { ArchitectureGraphDocument } from "../../config/define-config";
import type { ReactFlowEdgeData, ReactFlowGraph, ReactFlowNodeData } from "../../projection/types";

export interface ViewerPayload {
  graphDocument: ArchitectureGraphDocument;
  projection: ReactFlowGraph;
}

export type ViewerNodeData = ReactFlowNodeData & Record<string, unknown>;
export type ViewerEdgeData = ReactFlowEdgeData & Record<string, unknown>;

export type ViewerStatus =
  | { state: "loading" }
  | { state: "ready"; payload: ViewerPayload }
  | { state: "error"; message: string };
