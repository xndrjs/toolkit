import { describe, expect, expectTypeOf, it } from "vitest";

import { DomainValidationError } from "./errors";
import { getShapePatchImpl, shape, type ShapeInstance, type ShapeProps } from "./shape";
import type { Validator } from "./validation";

function fail(message: string, code = "invalid") {
  return {
    success: false as const,
    error: {
      engine: "test",
      issues: [{ code, path: [] as const, message }],
    },
  };
}

function itemValidator(): Validator<{ id: string; count?: number }, { id: string; count: number }> {
  return {
    engine: "test",
    validate(input) {
      if (typeof input !== "object" || input === null) {
        return fail("Expected object");
      }
      const row = input as Record<string, unknown>;
      const { id, count } = row;
      if (typeof id !== "string" || id.length === 0) {
        return fail("Invalid id");
      }
      const n = count === undefined ? 0 : count;
      if (typeof n !== "number" || !Number.isInteger(n) || n < 0) {
        return fail("Invalid count");
      }
      return { success: true, data: { id: id, count: n } };
    },
  };
}

function boxValidator(): Validator<{ id: string; count?: number }, { id: string; count: number }> {
  return itemValidator();
}

/** Stricter target: requires positive count */
function strictBoxValidator(): Validator<
  { id: string; count: number },
  { id: string; count: number }
> {
  return {
    engine: "test",
    validate(input) {
      if (typeof input !== "object" || input === null) {
        return fail("Expected object");
      }
      const row = input as Record<string, unknown>;
      const { id, count } = row;
      if (typeof id !== "string" || id.length === 0) {
        return fail("Invalid id");
      }
      if (typeof count !== "number" || !Number.isInteger(count) || count < 1) {
        return fail("count must be >= 1");
      }
      return { success: true, data: { id, count } };
    },
  };
}

describe("shape", () => {
  const Item = shape("Item", itemValidator());
  const Box = shape("Box", boxValidator());
  const Strict = shape("Strict", strictBoxValidator());

  it("create validates, freezes, and brands nominally", () => {
    const x = Item.create({ id: "a", count: 3 });
    expect(x.id).toBe("a");
    expect(x.count).toBe(3);
    expect(Object.isFrozen(x)).toBe(true);
    expect(Item.is(x)).toBe(true);
    expectTypeOf(x).toExtend<ShapeInstance<"Item", { id: string; count: number }>>();
  });

  it("create applies defaults via validator", () => {
    const x = Item.create({ id: "b" });
    expect(x.count).toBe(0);
  });

  it("safeCreate mirrors validation outcome", () => {
    const ok = Item.safeCreate({ id: "c", count: 1 });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.id).toBe("c");
      expect(Item.is(ok.data)).toBe(true);
    }
    const bad = Item.safeCreate({ id: "" });
    expect(bad.success).toBe(false);
  });

  it("create throws DomainValidationError with issues", () => {
    expect(() => Item.create({ id: "", count: 0 })).toThrow(DomainValidationError);
    try {
      Item.create({ id: "" });
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(DomainValidationError);
      expect((e as DomainValidationError).issues.length).toBeGreaterThan(0);
    }
  });

  it("is rejects wrong prototype or structurally invalid payload", () => {
    const plain = { id: "x", count: 1 };
    expect(Item.is(plain)).toBe(false);

    const valid = Item.create({ id: "y", count: 2 });
    expect(
      Item.is({
        id: valid.id,
        count: valid.count,
      })
    ).toBe(false);
    expect(Item.is(valid)).toBe(true);
  });

  it("JSON round-trip loses prototype; is false until create()", () => {
    const x = Item.create({ id: "z", count: 0 });
    const parsed = JSON.parse(JSON.stringify(x)) as unknown;
    expect(Item.is(parsed)).toBe(false);
  });

  it("project re-enters target boundary", () => {
    const i = Item.create({ id: "p", count: 5 });
    const b = Item.project(i, Box);
    expect(Box.is(b)).toBe(true);
    expect(b.id).toBe("p");
    expect(b.count).toBe(5);
    expect(Item.is(b)).toBe(false);
  });

  it("project throws when target create rejects spread row", () => {
    const i = Item.create({ id: "q", count: 0 });
    expect(() => Item.project(i, Strict)).toThrow(DomainValidationError);
  });

  it("internal patch clones, re-validates, preserves instance prototype chain", () => {
    const itemProto = Object.getPrototypeOf(Item.create({ id: "_", count: 0 }));
    const childProto = Object.create(itemProto);
    const base = Object.assign(Object.create(childProto), { id: "e", count: 1 }) as ShapeProps<
      "Item",
      { id: string; count: number }
    >;
    Object.freeze(base);
    expect(Item.is(base)).toBe(false);

    const patch = getShapePatchImpl(Item);
    const next = patch(base, { count: 2 });
    expect(next.count).toBe(2);
    expect(Object.getPrototypeOf(next)).toBe(childProto);
  });

  it("patch throws when draft violates validator", () => {
    const x = Item.create({ id: "bad-patch", count: 1 });
    const patch = getShapePatchImpl(Item);
    expect(() => patch(x, { count: -1 })).toThrow(DomainValidationError);
  });

  it("entity spread stays data-only (no kit keys)", () => {
    const x = Item.create({ id: "json", count: 0 });
    const spread = { ...x };
    expect("create" in spread).toBe(false);
    expect("validator" in spread).toBe(false);
    expect(JSON.stringify(x)).toContain("json");
  });
});
