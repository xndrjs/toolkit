import { describe, expect, it } from "vitest";

import { mapBatchToIds } from "./map-batch-to-ids";

describe("mapBatchToIds", () => {
  it("reorders batch results to match ids order", () => {
    const ids = ["a", "b", "c"] as const;
    const rows = [
      { id: "c", v: 3 },
      { id: "a", v: 1 },
      { id: "b", v: 2 },
    ];
    const out = mapBatchToIds(ids, rows, (r) => r.id);
    expect(out).toEqual([
      { id: "a", v: 1 },
      { id: "b", v: 2 },
      { id: "c", v: 3 },
    ]);
  });

  it("uses notFoundFactory for missing keys", () => {
    const ids = [1, 2, 3] as const;
    const rows = [{ id: 1 as const, x: true }];
    const custom = (id: number) => new Error(`missing ${id}`);
    const out = mapBatchToIds(ids, rows, (r) => r.id, custom);
    expect(out[0]).toEqual({ id: 1, x: true });
    expect(out[1]).toBeInstanceOf(Error);
    expect((out[1] as Error).message).toBe("missing 2");
    expect(out[2]).toBeInstanceOf(Error);
    expect((out[2] as Error).message).toBe("missing 3");
  });

  it("keeps undefined when the item was present with undefined field but key exists", () => {
    interface Row {
      id: number;
      val: string | undefined;
    }
    const ids = [1, 2] as const;
    const rows: Row[] = [
      { id: 1, val: undefined },
      { id: 2, val: "ok" },
    ];
    const out = mapBatchToIds<number, Row>(ids, rows, (r) => r.id);
    expect(out[0]).toEqual({ id: 1, val: undefined });
    expect(out[1]).toEqual({ id: 2, val: "ok" });
  });

  it("last duplicate key wins in lookup", () => {
    const ids = ["x"] as const;
    const rows = [
      { id: "x" as const, v: 1 },
      { id: "x" as const, v: 2 },
    ];
    const out = mapBatchToIds(ids, rows, (r) => r.id);
    expect(out[0]).toEqual({ id: "x", v: 2 });
  });

  it("uses custom error type when E extends Error", () => {
    class MissingRow extends Error {
      readonly id: number;
      constructor(id: number) {
        super(`missing ${id}`);
        this.name = "MissingRow";
        this.id = id;
      }
    }

    const ids = [1, 2] as const;
    const rows = [{ id: 1 as const, ok: true }];
    const out = mapBatchToIds<number, { id: 1 | 2; ok?: boolean }, MissingRow>(
      ids,
      rows,
      (r) => r.id,
      (id) => new MissingRow(id)
    );

    expect(out[0]).toEqual({ id: 1, ok: true });
    expect(out[1]).toBeInstanceOf(MissingRow);
    expect((out[1] as MissingRow).id).toBe(2);
  });
});
