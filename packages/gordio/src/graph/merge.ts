import { createEdgeKey } from "./create-edge-key";
import { ArchitectureGraphError } from "./errors";
import type {
  ArchitectureBox,
  ArchitectureEdge,
  ArchitectureGraph,
  ArchitectureNode,
  GraphFragment,
} from "./types";
import { validateArchitectureGraph } from "./validate";

export function mergeGraphFragments(fragments: GraphFragment[]): ArchitectureGraph {
  const boxes = new Map<string, ArchitectureBox>();
  const nodes = new Map<string, ArchitectureNode>();
  const edges = new Map<string, ArchitectureEdge>();

  for (const fragment of fragments) {
    for (const box of fragment.boxes ?? []) {
      const current = boxes.get(box.id);
      boxes.set(box.id, current ? mergeBox(current, box) : box);
    }

    for (const node of fragment.nodes ?? []) {
      const current = nodes.get(node.id);
      nodes.set(node.id, current ? mergeNode(current, node) : node);
    }

    for (const edge of fragment.edges ?? []) {
      const key = createEdgeKey(edge);
      const current = edges.get(key);
      edges.set(key, current ? mergeEdge(current, edge) : edge);
    }
  }

  return validateArchitectureGraph({
    boxes: [...boxes.values()],
    nodes: [...nodes.values()],
    edges: [...edges.values()],
  });
}

function mergeBox(current: ArchitectureBox, next: ArchitectureBox): ArchitectureBox {
  assertSame("box", current.id, "kind", current.kind, next.kind);
  assertSame("box", current.id, "laneId", current.laneId, next.laneId);

  const merged: ArchitectureBox = { ...current };
  const packageName = current.packageName ?? next.packageName;
  const metadata = mergeRecords(current.metadata, next.metadata);

  if (packageName !== undefined) {
    merged.packageName = packageName;
  }

  if (metadata !== undefined) {
    merged.metadata = metadata;
  }

  return merged;
}

function mergeNode(current: ArchitectureNode, next: ArchitectureNode): ArchitectureNode {
  assertSame("node", current.id, "kind", current.kind, next.kind);
  assertSame("node", current.id, "boxId", current.boxId, next.boxId);
  assertOptionalSame("node", current.id, "slot", current.slot, next.slot);

  const merged: ArchitectureNode = { ...current };
  const type = current.type ?? next.type;
  const data = mergeRecords(current.data, next.data);

  if (type !== undefined) {
    merged.type = type;
  }

  if (data !== undefined) {
    merged.data = data;
  }

  return merged;
}

function mergeEdge(current: ArchitectureEdge, next: ArchitectureEdge): ArchitectureEdge {
  const merged: ArchitectureEdge = { ...current };
  const metadata = mergeRecords(current.metadata, next.metadata);

  if (metadata !== undefined) {
    merged.metadata = metadata;
  }

  return merged;
}

function mergeRecords<T extends Record<string, unknown>>(
  current: T | undefined,
  next: T | undefined
): T | undefined {
  if (!current) {
    return next;
  }

  if (!next) {
    return current;
  }

  return { ...current, ...next };
}

function assertSame(
  entity: "box" | "node",
  id: string,
  field: string,
  current: string,
  next: string
): void {
  if (current !== next) {
    throw new ArchitectureGraphError(
      `Conflicting ${entity} "${id}" field "${field}": "${current}" is not "${next}"`
    );
  }
}

function assertOptionalSame(
  entity: "box" | "node",
  id: string,
  field: string,
  current: string | undefined,
  next: string | undefined
): void {
  if (current !== undefined && next !== undefined) {
    assertSame(entity, id, field, current, next);
  }
}
