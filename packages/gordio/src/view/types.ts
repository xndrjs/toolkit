import type {
  ArchitectureGraph,
  ArchitectureId,
  ArchitectureViewSchema,
  EdgeKey,
} from "../graph/types";
import type { ArchitectureViewState, VisualState } from "../projection/types";

export type ReachabilityMode = "directed" | "undirected" | "downstream" | "upstream";

export type ArchitectureInteraction =
  | { type: "select-node"; nodeId: ArchitectureId }
  | { type: "select-composition-root"; nodeId: ArchitectureId; mode?: ReachabilityMode }
  | { type: "toggle-box-collapse"; boxId: ArchitectureId }
  | { type: "clear-selection" };

export interface DecorationPatch {
  selectedId?: ArchitectureId | null;
  collapsedBoxes?: Record<ArchitectureId, boolean>;
  boxes?: Record<ArchitectureId, VisualState>;
  nodes?: Record<ArchitectureId, VisualState>;
  edges?: Record<EdgeKey, VisualState>;
}

export interface ArchitecturePolicyInput {
  graph: ArchitectureGraph;
  schema: ArchitectureViewSchema;
  viewState: ArchitectureViewState;
  event: ArchitectureInteraction;
}

export type ArchitecturePolicy = (input: ArchitecturePolicyInput) => DecorationPatch;

export interface ApplyArchitecturePoliciesInput {
  graph: ArchitectureGraph;
  schema: ArchitectureViewSchema;
  viewState: ArchitectureViewState;
  event: ArchitectureInteraction;
  policies?: ArchitecturePolicy[];
}
