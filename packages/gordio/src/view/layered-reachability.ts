import type { ArchitectureGraph, ArchitectureId, ArchitectureViewSchema } from "../graph/types";
import { createSlotIndex } from "./slot-index";

export interface LayerRule {
  id: string;
  from: string[];
  to: string[];
  directed?: boolean;
}

export interface LayeredReachabilityPreset {
  seedSlot: string;
  rules: LayerRule[];
}

export interface LayeredReachabilityResult {
  activeNodeIds: Set<ArchitectureId>;
  openedBoxIds: Set<ArchitectureId>;
}

export function computeLayeredReachability(
  graph: ArchitectureGraph,
  schema: ArchitectureViewSchema,
  rootNodeId: ArchitectureId,
  preset: LayeredReachabilityPreset
): LayeredReachabilityResult {
  const slotIndex = createSlotIndex(graph, schema);
  const rootNode = graph.nodes.find((node) => node.id === rootNodeId);

  if (!rootNode || slotIndex.resolveNodeSlotId(rootNode) !== preset.seedSlot) {
    return { activeNodeIds: new Set(), openedBoxIds: new Set() };
  }

  const activeBySlot = new Map<string, Set<ArchitectureId>>();
  const seedNodes = activeBySlot.get(preset.seedSlot) ?? new Set<ArchitectureId>();
  seedNodes.add(rootNodeId);
  activeBySlot.set(preset.seedSlot, seedNodes);

  const openedBoxIds = collectOpenedBoxIds(graph, rootNodeId, slotIndex.boxIds);

  for (const rule of preset.rules) {
    applyLayerRule(graph, slotIndex, activeBySlot, rule);
  }

  const activeNodeIds = new Set<ArchitectureId>();
  for (const nodeIds of activeBySlot.values()) {
    for (const nodeId of nodeIds) {
      activeNodeIds.add(nodeId);
    }
  }

  return { activeNodeIds, openedBoxIds };
}

function collectOpenedBoxIds(
  graph: ArchitectureGraph,
  rootNodeId: ArchitectureId,
  boxIds: Set<ArchitectureId>
): Set<ArchitectureId> {
  const openedBoxIds = new Set<ArchitectureId>();

  for (const edge of graph.edges) {
    if (edge.sourceId === rootNodeId && boxIds.has(edge.targetId)) {
      openedBoxIds.add(edge.targetId);
    }
  }

  return openedBoxIds;
}

function applyLayerRule(
  graph: ArchitectureGraph,
  slotIndex: ReturnType<typeof createSlotIndex>,
  activeBySlot: Map<string, Set<ArchitectureId>>,
  rule: LayerRule
): void {
  const fromActive = getActiveNodes(activeBySlot, rule.from);
  if (fromActive.size === 0) {
    return;
  }

  const toSlotSet = new Set(rule.to);
  const directed = rule.directed !== false;
  const activated = new Set<ArchitectureId>();

  for (const edge of graph.edges) {
    const sourceSlot = getEndpointSlot(graph, slotIndex, edge.sourceId);
    const targetSlot = getEndpointSlot(graph, slotIndex, edge.targetId);

    if (directed) {
      if (fromActive.has(edge.sourceId) && toSlotSet.has(targetSlot)) {
        activated.add(edge.targetId);
      }
      continue;
    }

    if (fromActive.has(edge.sourceId) && toSlotSet.has(targetSlot)) {
      activated.add(edge.targetId);
    }

    if (fromActive.has(edge.targetId) && toSlotSet.has(sourceSlot)) {
      activated.add(edge.sourceId);
    }
  }

  for (const nodeId of activated) {
    const slotId = getEndpointSlot(graph, slotIndex, nodeId);
    if (!toSlotSet.has(slotId)) {
      continue;
    }

    const slotNodes = activeBySlot.get(slotId) ?? new Set<ArchitectureId>();
    slotNodes.add(nodeId);
    activeBySlot.set(slotId, slotNodes);
  }
}

function getActiveNodes(
  activeBySlot: Map<string, Set<ArchitectureId>>,
  slotIds: readonly string[]
): Set<ArchitectureId> {
  const active = new Set<ArchitectureId>();

  for (const slotId of slotIds) {
    for (const nodeId of activeBySlot.get(slotId) ?? []) {
      active.add(nodeId);
    }
  }

  return active;
}

function getEndpointSlot(
  graph: ArchitectureGraph,
  slotIndex: ReturnType<typeof createSlotIndex>,
  endpointId: ArchitectureId
): string {
  const node = graph.nodes.find((candidate) => candidate.id === endpointId);
  if (!node) {
    return "";
  }

  return slotIndex.resolveNodeSlotId(node);
}
