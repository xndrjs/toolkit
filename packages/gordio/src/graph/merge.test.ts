import { describe, expect, it } from "vitest";

import { ArchitectureGraphError } from "./errors";
import { mergeGraphFragments } from "./merge";
import type { GraphFragment } from "./types";
import { validateArchitectureGraph } from "./validate";

const overlappingFragments: GraphFragment[] = [
  {
    boxes: [
      {
        id: "pkg:core-orders",
        kind: "core-package",
        title: "Orders",
        laneId: "core",
        metadata: { discoveredBy: "package-json" },
      },
    ],
    nodes: [
      {
        id: "core:orders:SubmitOrder",
        kind: "capability",
        title: "SubmitOrder",
        boxId: "pkg:core-orders",
        slot: "operations",
        data: { file: "submit-order.ts" },
      },
    ],
  },
  {
    boxes: [
      {
        id: "pkg:core-orders",
        kind: "core-package",
        title: "Orders",
        laneId: "core",
        packageName: "@acme/core-orders",
        metadata: { owner: "checkout" },
      },
    ],
    nodes: [
      {
        id: "core:orders:SubmitOrder",
        kind: "capability",
        title: "SubmitOrder",
        boxId: "pkg:core-orders",
        slot: "operations",
        data: { exported: true },
      },
      {
        id: "core:orders:OrderRepository",
        kind: "port",
        title: "OrderRepository",
        boxId: "pkg:core-orders",
        slot: "ports",
      },
    ],
    edges: [
      {
        sourceId: "core:orders:SubmitOrder",
        targetId: "core:orders:OrderRepository",
        kind: "uses",
        directed: true,
        metadata: { matcher: "capability-parser" },
      },
    ],
  },
  {
    edges: [
      {
        sourceId: "core:orders:SubmitOrder",
        targetId: "core:orders:OrderRepository",
        kind: "uses",
        directed: true,
        metadata: { confirmed: true },
      },
      {
        sourceId: "core:orders:SubmitOrder",
        targetId: "core:orders:OrderRepository",
        kind: "implements",
        directed: true,
      },
    ],
  },
];

describe("mergeGraphFragments", () => {
  it("dedupes overlapping boxes, nodes, and semantic edges", () => {
    const graph = mergeGraphFragments(overlappingFragments);

    expect(graph).toMatchInlineSnapshot(`
      {
        "boxes": [
          {
            "id": "pkg:core-orders",
            "kind": "core-package",
            "laneId": "core",
            "metadata": {
              "discoveredBy": "package-json",
              "owner": "checkout",
            },
            "packageName": "@acme/core-orders",
            "title": "Orders",
          },
        ],
        "edges": [
          {
            "directed": true,
            "kind": "uses",
            "metadata": {
              "confirmed": true,
              "matcher": "capability-parser",
            },
            "sourceId": "core:orders:SubmitOrder",
            "targetId": "core:orders:OrderRepository",
          },
          {
            "directed": true,
            "kind": "implements",
            "sourceId": "core:orders:SubmitOrder",
            "targetId": "core:orders:OrderRepository",
          },
        ],
        "nodes": [
          {
            "boxId": "pkg:core-orders",
            "data": {
              "exported": true,
              "file": "submit-order.ts",
            },
            "id": "core:orders:SubmitOrder",
            "kind": "capability",
            "slot": "operations",
            "title": "SubmitOrder",
          },
          {
            "boxId": "pkg:core-orders",
            "id": "core:orders:OrderRepository",
            "kind": "port",
            "slot": "ports",
            "title": "OrderRepository",
          },
        ],
      }
    `);
  });

  it("keeps different edge kinds between the same nodes distinct", () => {
    const graph = mergeGraphFragments(overlappingFragments);

    expect(graph.edges).toHaveLength(2);
    expect(graph.edges.map((edge) => edge.kind)).toEqual(["uses", "implements"]);
  });

  it("throws on incompatible box or node definitions", () => {
    expect(() =>
      mergeGraphFragments([
        {
          boxes: [{ id: "pkg:orders", kind: "core-package", title: "Orders", laneId: "core" }],
          nodes: [
            {
              id: "core:orders:SubmitOrder",
              kind: "capability",
              title: "SubmitOrder",
              boxId: "pkg:orders",
              slot: "operations",
            },
          ],
        },
        {
          boxes: [
            {
              id: "pkg:orders",
              kind: "infrastructure-package",
              title: "Orders",
              laneId: "infrastructure",
            },
          ],
          nodes: [
            {
              id: "core:orders:SubmitOrder",
              kind: "service",
              title: "SubmitOrder",
              boxId: "pkg:orders",
              slot: "operations",
            },
          ],
        },
      ])
    ).toThrow('Conflicting box "pkg:orders" field "kind"');

    expect(() =>
      mergeGraphFragments([
        {
          boxes: [
            { id: "pkg:orders", kind: "core-package", title: "Orders", laneId: "core" },
            { id: "pkg:billing", kind: "core-package", title: "Billing", laneId: "core" },
          ],
          nodes: [
            {
              id: "core:orders:SubmitOrder",
              kind: "capability",
              title: "SubmitOrder",
              boxId: "pkg:orders",
            },
          ],
        },
        {
          nodes: [
            {
              id: "core:orders:SubmitOrder",
              kind: "capability",
              title: "SubmitOrder",
              boxId: "pkg:billing",
            },
          ],
        },
      ])
    ).toThrow('Conflicting node "core:orders:SubmitOrder" field "boxId"');
  });
});

describe("validateArchitectureGraph", () => {
  it("throws readable errors for invalid references", () => {
    expect(() =>
      validateArchitectureGraph({
        boxes: [],
        nodes: [
          {
            id: "core:orders:SubmitOrder",
            kind: "capability",
            title: "SubmitOrder",
            boxId: "pkg:missing",
          },
        ],
        edges: [
          {
            sourceId: "core:orders:SubmitOrder",
            targetId: "core:orders:MissingPort",
            kind: "uses",
            directed: true,
          },
        ],
      })
    ).toThrow(
      /Node "core:orders:SubmitOrder" references missing box "pkg:missing"[\s\S]*references missing target node "core:orders:MissingPort"/
    );
  });

  it("throws a typed error for duplicate ids and edges", () => {
    expect(() =>
      validateArchitectureGraph({
        boxes: [
          { id: "pkg:orders", kind: "core-package", title: "Orders", laneId: "core" },
          { id: "pkg:orders", kind: "core-package", title: "Orders", laneId: "core" },
        ],
        nodes: [
          {
            id: "core:orders:SubmitOrder",
            kind: "capability",
            title: "SubmitOrder",
            boxId: "pkg:orders",
          },
          {
            id: "core:orders:OrderRepository",
            kind: "port",
            title: "OrderRepository",
            boxId: "pkg:orders",
          },
        ],
        edges: [
          {
            sourceId: "core:orders:SubmitOrder",
            targetId: "core:orders:OrderRepository",
            kind: "uses",
            directed: true,
          },
          {
            sourceId: "core:orders:SubmitOrder",
            targetId: "core:orders:OrderRepository",
            kind: "uses",
            directed: true,
          },
        ],
      })
    ).toThrow(ArchitectureGraphError);
  });
});
