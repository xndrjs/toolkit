import type { ArchitectureGraphDocument } from "../../config/define-config";
import type { ArchitectureViewSchema } from "../../graph/types";
import type { ArchitectureViewState, ReactFlowGraph } from "../../projection/types";
import type { ViewerPayload } from "./types";

export async function loadViewerPayload(): Promise<ViewerPayload> {
  const [documentResponse, schemaResponse, viewStateResponse, projectionResponse] =
    await Promise.all([
      fetch("/graph.json"),
      fetch("/schema.json"),
      fetch("/view-state.json"),
      fetch("/projection.json"),
    ]);

  if (!documentResponse.ok) {
    throw new Error(`Failed to load graph document: ${documentResponse.status}`);
  }

  if (!schemaResponse.ok) {
    throw new Error(`Failed to load view schema: ${schemaResponse.status}`);
  }

  if (!viewStateResponse.ok) {
    throw new Error(`Failed to load view state: ${viewStateResponse.status}`);
  }

  if (!projectionResponse.ok) {
    throw new Error(`Failed to load React Flow projection: ${projectionResponse.status}`);
  }

  return {
    graphDocument: (await documentResponse.json()) as ArchitectureGraphDocument,
    schema: (await schemaResponse.json()) as ArchitectureViewSchema,
    viewState: (await viewStateResponse.json()) as ArchitectureViewState,
    projection: (await projectionResponse.json()) as ReactFlowGraph,
  };
}
