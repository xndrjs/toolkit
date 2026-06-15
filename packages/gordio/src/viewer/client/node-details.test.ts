import { describe, expect, it } from "vitest";

import type { ArchitectureGraph } from "../../graph/types";
import { cleanArchitecturePreset } from "../../presets/clean-architecture";
import { buildNodeDetails } from "./node-details";

const graph: ArchitectureGraph = {
  boxes: [
    { id: "pkg:orders", kind: "core-package", title: "Orders", laneId: "core" },
    {
      id: "pkg:orders-infra",
      kind: "infrastructure-package",
      title: "Orders Infrastructure",
      laneId: "infrastructure",
    },
  ],
  nodes: [
    {
      id: "core:orders:place-order",
      kind: "use-case",
      title: "PlaceOrder",
      boxId: "pkg:orders",
    },
    {
      id: "core:orders:order-repository",
      kind: "port",
      title: "OrderRepository",
      boxId: "pkg:orders",
    },
    {
      id: "infra:orders:sql-order-repository",
      kind: "repository",
      title: "SqlOrderRepository",
      boxId: "pkg:orders-infra",
    },
  ],
  edges: [
    {
      sourceId: "core:orders:place-order",
      targetId: "core:orders:order-repository",
      kind: "uses",
      directed: true,
    },
    {
      sourceId: "infra:orders:sql-order-repository",
      targetId: "core:orders:order-repository",
      kind: "implements",
      directed: true,
    },
  ],
};

describe("buildNodeDetails", () => {
  it("returns null when nothing is selected", () => {
    expect(buildNodeDetails(graph, cleanArchitecturePreset, undefined)).toBeNull();
  });

  it("builds node metadata and connections for the selected node", () => {
    const details = buildNodeDetails(graph, cleanArchitecturePreset, "core:orders:place-order");

    expect(details).toMatchObject({
      nodeId: "core:orders:place-order",
      title: "PlaceOrder",
      kindLabel: "Use Case",
      boxTitle: "Orders",
      connections: [
        {
          direction: "outgoing",
          peerTitle: "OrderRepository",
          peerKind: "port",
          selectable: true,
        },
      ],
    });
  });

  it("includes incoming connections for the selected node", () => {
    const details = buildNodeDetails(
      graph,
      cleanArchitecturePreset,
      "core:orders:order-repository"
    );

    expect(details?.connections).toEqual([
      {
        direction: "incoming",
        peerId: "core:orders:place-order",
        peerTitle: "PlaceOrder",
        peerKind: "use-case",
        selectable: true,
      },
      {
        direction: "incoming",
        peerId: "infra:orders:sql-order-repository",
        peerTitle: "SqlOrderRepository",
        peerKind: "repository",
        selectable: true,
      },
    ]);
  });
});
