import { describe, expect, it } from "vitest";

import { createEdgeKey } from "./create-edge-key";

describe("createEdgeKey", () => {
  it("preserves source and target order for directed edges", () => {
    const forward = createEdgeKey({
      sourceId: "core:orders:SubmitOrder",
      targetId: "core:orders:OrderRepository",
      kind: "uses",
      directed: true,
    });
    const reverse = createEdgeKey({
      sourceId: "core:orders:OrderRepository",
      targetId: "core:orders:SubmitOrder",
      kind: "uses",
      directed: true,
    });

    expect(forward).not.toBe(reverse);
  });

  it("sorts endpoints for undirected edges", () => {
    const first = createEdgeKey({
      sourceId: "core:orders:Order",
      targetId: "core:orders:OrderEvent",
      kind: "related",
    });
    const second = createEdgeKey({
      sourceId: "core:orders:OrderEvent",
      targetId: "core:orders:Order",
      kind: "related",
      directed: false,
    });

    expect(first).toBe(second);
  });

  it("keeps different edge kinds distinct", () => {
    const uses = createEdgeKey({
      sourceId: "core:orders:SubmitOrder",
      targetId: "core:orders:OrderRepository",
      kind: "uses",
      directed: true,
    });
    const implementsEdge = createEdgeKey({
      sourceId: "core:orders:SubmitOrder",
      targetId: "core:orders:OrderRepository",
      kind: "implements",
      directed: true,
    });

    expect(uses).not.toBe(implementsEdge);
  });
});
