import { describe, expect, it } from "vitest";

import { formatType, isAssignable, typesSemanticallyEqual } from "./assignability";
import { field, nullable, objectType, prim, span } from "../fixtures";

describe("assignability — optional + nullable", () => {
  it("treats optional as part of object equality", () => {
    const required = objectType(field("title", prim("string")));
    const optional = objectType(field("title", prim("string"), false, null, true));
    expect(typesSemanticallyEqual(required, optional)).toBe(false);
    expect(typesSemanticallyEqual(optional, optional)).toBe(true);
  });

  it("formats optional fields and nullable as DSL-like surface", () => {
    expect(formatType(nullable(prim("string")))).toBe("string | null");
    expect(
      formatType(objectType(field("title", nullable(prim("string")), false, null, true)))
    ).toBe("{ title?: string | null }");
  });

  it("keeps T assignable to nullable T", () => {
    expect(isAssignable(prim("string"), nullable(prim("string")))).toBe(true);
    expect(isAssignable(nullable(prim("string")), prim("string"))).toBe(false);
  });

  it("does not treat bare null as assignable", () => {
    const bareNull = { kind: "null" as const, span };
    expect(isAssignable(bareNull, prim("string"))).toBe(false);
    expect(isAssignable(prim("string"), bareNull)).toBe(false);
  });
});
