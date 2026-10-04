import { describe, expect, it } from "vitest";

import { createDiagnosticSink } from "./diagnostic";
import { checkNoOpaqueInType, containsOpaqueType, isOpaqueLeafType } from "./opaque-validation";
import { arrayOf, field, nullable, objectType, opaqueRef, prim, union } from "../fixtures";

describe("opaque-validation helpers", () => {
  it("containsOpaqueType walks wrappers and object fields", () => {
    expect(containsOpaqueType(opaqueRef("RichDocument"))).toBe(true);
    expect(containsOpaqueType(nullable(opaqueRef("RichDocument")))).toBe(true);
    expect(containsOpaqueType(arrayOf(opaqueRef("RichDocument")))).toBe(true);
    expect(containsOpaqueType(objectType(field("body", opaqueRef("RichDocument"))))).toBe(true);
    expect(containsOpaqueType(union(prim("string"), opaqueRef("RichDocument")))).toBe(true);
    expect(containsOpaqueType(prim("string"))).toBe(false);
    expect(containsOpaqueType(objectType(field("title", prim("string"))))).toBe(false);
  });

  it("isOpaqueLeafType follows wrappers but not object fields", () => {
    expect(isOpaqueLeafType(opaqueRef("RichDocument"))).toBe(true);
    expect(isOpaqueLeafType(nullable(arrayOf(opaqueRef("RichDocument"))))).toBe(true);
    expect(isOpaqueLeafType(union(opaqueRef("RichDocument"), opaqueRef("Media")))).toBe(true);
    expect(isOpaqueLeafType(objectType(field("body", opaqueRef("RichDocument"))))).toBe(false);
    expect(isOpaqueLeafType(prim("string"))).toBe(false);
  });

  it("checkNoOpaqueInType emits the provided diagnostic", () => {
    const sink = createDiagnosticSink();
    const type = opaqueRef("RichDocument");
    expect(
      checkNoOpaqueInType(type, "path", "OPAQUE_TYPE_NOT_ALLOWED_IN_IDENTITY", "nope", sink)
    ).toBe(true);
    expect(sink.diagnostics).toEqual([
      expect.objectContaining({
        code: "OPAQUE_TYPE_NOT_ALLOWED_IN_IDENTITY",
        message: "nope",
        path: "path",
      }),
    ]);
    expect(checkNoOpaqueInType(prim("string"), "path", "X", "y", sink)).toBe(false);
  });
});
