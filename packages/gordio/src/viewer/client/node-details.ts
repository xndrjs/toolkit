import type {
  ArchitectureGraph,
  ArchitectureId,
  ArchitectureNode,
  ArchitectureViewSchema,
} from "../../graph/types";

export interface NodeConnectionDetail {
  direction: "outgoing" | "incoming";
  label: string;
  peerId: ArchitectureId;
  peerTitle: string;
  peerKind?: string;
}

export interface NodeDetails {
  nodeId: ArchitectureId;
  title: string;
  kind: string;
  kindLabel: string;
  boxTitle: string;
  boxPackageName?: string;
  slotTitle?: string;
  connections: NodeConnectionDetail[];
}

export function buildNodeDetails(
  graph: ArchitectureGraph,
  schema: ArchitectureViewSchema,
  selectedId: ArchitectureId | undefined
): NodeDetails | null {
  if (!selectedId) {
    return null;
  }

  const node = graph.nodes.find((candidate) => candidate.id === selectedId);
  if (!node) {
    return null;
  }

  const box = graph.boxes.find((candidate) => candidate.id === node.boxId);
  const nodeKind = schema.nodeKinds.find((candidate) => candidate.id === node.kind);
  const boxKind = box ? schema.boxKinds.find((candidate) => candidate.id === box.kind) : undefined;
  const slotId = node.slot ?? nodeKind?.defaultSlot;
  const slot = boxKind?.slots.find((candidate) => candidate.id === slotId);

  return {
    nodeId: node.id,
    title: node.title,
    kind: node.kind,
    kindLabel: formatKindLabel(node.kind),
    boxTitle: box?.title ?? node.boxId,
    ...(box?.packageName ? { boxPackageName: box.packageName } : {}),
    ...(slot ? { slotTitle: slot.title } : {}),
    connections: buildNodeConnections(graph, node),
  };
}

function buildNodeConnections(
  graph: ArchitectureGraph,
  node: ArchitectureNode
): NodeConnectionDetail[] {
  const connections: NodeConnectionDetail[] = [];

  for (const edge of graph.edges) {
    if (edge.sourceId === node.id) {
      connections.push({
        direction: "outgoing",
        label: formatEdgeLabel(edge.kind),
        peerId: edge.targetId,
        ...resolveEndpointDetails(graph, edge.targetId),
      });
      continue;
    }

    if (edge.targetId === node.id) {
      connections.push({
        direction: "incoming",
        label: formatEdgeLabel(edge.kind),
        peerId: edge.sourceId,
        ...resolveEndpointDetails(graph, edge.sourceId),
      });
    }
  }

  return connections.sort(compareConnections);
}

function resolveEndpointDetails(
  graph: ArchitectureGraph,
  endpointId: ArchitectureId
): Pick<NodeConnectionDetail, "peerTitle" | "peerKind"> {
  const peerNode = graph.nodes.find((candidate) => candidate.id === endpointId);
  if (peerNode) {
    return {
      peerTitle: peerNode.title,
      peerKind: peerNode.kind,
    };
  }

  const peerBox = graph.boxes.find((candidate) => candidate.id === endpointId);
  if (peerBox) {
    return {
      peerTitle: peerBox.title,
      peerKind: peerBox.kind,
    };
  }

  return { peerTitle: endpointId };
}

function compareConnections(left: NodeConnectionDetail, right: NodeConnectionDetail): number {
  return (
    left.direction.localeCompare(right.direction) ||
    left.label.localeCompare(right.label) ||
    left.peerTitle.localeCompare(right.peerTitle)
  );
}

export function formatKindLabel(kind: string): string {
  return kind
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatEdgeLabel(kind: string | undefined): string {
  return kind ?? "relates to";
}
