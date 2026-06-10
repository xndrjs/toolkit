import type { ArchitectureGraphDocument } from "../../config/define-config";
import type { ReactFlowGraph } from "../../projection/types";
import type { ViewerPayload } from "./types";

export async function loadViewerPayload(): Promise<ViewerPayload> {
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
