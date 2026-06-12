import type {
  ArchitectureBox,
  ArchitectureEdge,
  ArchitectureGraph,
  ArchitectureId,
  ArchitectureNode,
  ArchitectureViewSchema,
  BoxKindDefinition,
  EdgeKey,
  LaneDefinition,
  NodeKindDefinition,
  SlotDefinition,
} from "../graph/types";

export type VisualState = "normal" | "highlighted" | "muted";

export interface ReactFlowProjectionOptions {
  graph: ArchitectureGraph;
  schema: ArchitectureViewSchema;
  viewState?: ArchitectureViewState;
}

export interface ArchitectureViewState {
  selectedId?: ArchitectureId;
  compositionRootId?: ArchitectureId;
  collapsedBoxes?: Record<ArchitectureId, boolean>;
  visual?: {
    boxes: Record<ArchitectureId, VisualState>;
    nodes: Record<ArchitectureId, VisualState>;
    edges: Record<EdgeKey, VisualState>;
  };
  boxPositions?: Record<ArchitectureId, ReactFlowPosition>;
  boxSizes?: Record<ArchitectureId, ReactFlowSize>;
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
  width?: number;
  height?: number;
}

export interface ReactFlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
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
  architectureEdgeKeys?: EdgeKey[];
}

export interface ReactFlowPosition {
  x: number;
  y: number;
}

export interface ReactFlowSize {
  width: number;
  height: number;
}
