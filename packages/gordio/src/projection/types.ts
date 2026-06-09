import type {
  ArchitectureBox,
  ArchitectureEdge,
  ArchitectureGraph,
  ArchitectureId,
  ArchitectureNode,
  ArchitectureViewSchema,
  BoxKindDefinition,
  LaneDefinition,
  NodeKindDefinition,
  SlotDefinition,
} from "../graph/types";

export interface ReactFlowProjectionOptions {
  graph: ArchitectureGraph;
  schema: ArchitectureViewSchema;
  viewState?: ArchitectureViewState;
}

export interface ArchitectureViewState {
  collapsedBoxIds?: readonly ArchitectureId[];
  boxPositions?: Record<ArchitectureId, ReactFlowPosition>;
  nodePositions?: Record<ArchitectureId, ReactFlowPosition>;
}

export interface ReactFlowGraph {
  nodes: ReactFlowNode[];
  edges: ReactFlowEdge[];
}

export interface ReactFlowNode {
  id: string;
  type: "architectureBox" | "architectureNode";
  position: ReactFlowPosition;
  parentId?: string;
  extent?: "parent";
  data: ReactFlowNodeData;
}

export interface ReactFlowNodeData {
  entity: "box" | "node";
  box?: ArchitectureBox;
  node?: ArchitectureNode;
  lane?: LaneDefinition;
  boxKind?: BoxKindDefinition;
  nodeKind?: NodeKindDefinition;
  slot?: SlotDefinition;
  collapsed?: boolean;
  renderAs?: string;
}

export interface ReactFlowEdge {
  id: string;
  source: string;
  target: string;
  type: "architectureEdge";
  animated: boolean;
  data: ReactFlowEdgeData;
}

export interface ReactFlowEdgeData {
  edge: ArchitectureEdge;
  directed: boolean;
  kind?: string;
  sourceId: ArchitectureId;
  targetId: ArchitectureId;
  rerouted: boolean;
}

export interface ReactFlowPosition {
  x: number;
  y: number;
}
