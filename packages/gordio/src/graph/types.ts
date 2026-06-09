export type ArchitectureId = string;

export interface ArchitectureGraph {
  boxes: ArchitectureBox[];
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
}

export interface GraphFragment {
  boxes?: ArchitectureBox[];
  nodes?: ArchitectureNode[];
  edges?: ArchitectureEdge[];
}

export interface ArchitectureBox {
  id: ArchitectureId;
  kind: string;
  title: string;
  laneId: string;
  packageName?: string;
  metadata?: Record<string, unknown>;
}

export interface ArchitectureNode {
  id: ArchitectureId;
  kind: string;
  title: string;
  boxId: ArchitectureId;
  slot?: string;
  type?: string;
  data?: Record<string, unknown>;
}

export interface ArchitectureEdge {
  sourceId: ArchitectureId;
  targetId: ArchitectureId;
  kind?: string;
  directed?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ArchitectureViewSchema {
  lanes: LaneDefinition[];
  boxKinds: BoxKindDefinition[];
  nodeKinds: NodeKindDefinition[];
}

export interface LaneDefinition {
  id: string;
  title: string;
  order: number;
}

export interface BoxKindDefinition {
  id: string;
  laneId: string;
  slots: SlotDefinition[];
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

export interface SlotDefinition {
  id: string;
  title: string;
  order: number;
  accepts?: string[];
}

export interface NodeKindDefinition {
  id: string;
  defaultSlot?: string;
  renderAs?: "compact" | "card" | "signature" | string;
}

export type EdgeKey = string;
