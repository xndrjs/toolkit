import { describe, expect, it } from "vitest";

import { formatType, isAssignable, literalInhabits, typesSemanticallyEqual } from "./assignability";
import { field, nullable, objectType, opaqueRef, prim, span } from "../fixtures";

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

  it("treats integer as assignable to number but not the reverse", () => {
    expect(isAssignable(prim("integer"), prim("number"))).toBe(true);
    expect(isAssignable(prim("number"), prim("integer"))).toBe(false);
    expect(typesSemanticallyEqual(prim("integer"), prim("number"))).toBe(false);
  });

  it("lets integer literals inhabit integer; floats only inhabit number", () => {
    expect(literalInhabits(3, prim("integer"), () => undefined)).toBe(true);
    expect(literalInhabits(1.5, prim("integer"), () => undefined)).toBe(false);
    expect(literalInhabits(1.5, prim("number"), () => undefined)).toBe(true);
    expect(literalInhabits(3, prim("number"), () => undefined)).toBe(true);
  });
});

describe("assignability — opaque", () => {
  it("equates opaque refs only by name", () => {
    expect(typesSemanticallyEqual(opaqueRef("RichDocument"), opaqueRef("RichDocument"))).toBe(true);
    expect(typesSemanticallyEqual(opaqueRef("RichDocument"), opaqueRef("MediaDescriptor"))).toBe(
      false
    );
    expect(isAssignable(opaqueRef("RichDocument"), opaqueRef("RichDocument"))).toBe(true);
    expect(isAssignable(opaqueRef("RichDocument"), opaqueRef("MediaDescriptor"))).toBe(false);
    expect(isAssignable(opaqueRef("RichDocument"), prim("string"))).toBe(false);
  });

  it("formats opaque names and rejects literal inhabitance", () => {
    expect(formatType(opaqueRef("RichDocument"))).toBe("RichDocument");
    expect(literalInhabits("x", opaqueRef("RichDocument"), () => undefined)).toBe(false);
    expect(literalInhabits(null, nullable(opaqueRef("RichDocument")), () => undefined)).toBe(true);
  });
});
