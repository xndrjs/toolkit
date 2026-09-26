import { describe, expect, it } from "vitest";

import { ctx, eq, identity, item, lit, param, payload } from "../../../fixtures";
import type { Expr } from "../../../ir";
import { emitExpr, projectionArmDiscriminant } from "./emit-expr";

describe("emitExpr", () => {
  it("emits literals", () => {
    expect(emitExpr(lit("Hero"))).toBe('"Hero"');
    expect(emitExpr(lit(1.5))).toBe("1.5");
    expect(emitExpr(lit(true))).toBe("true");
    expect(emitExpr(lit(null))).toBe("null");
  });

  it("emits params as args.params.name (projection scope)", () => {
    expect(emitExpr(param("postId"))).toBe("args.params.postId");
  });

  it("emits context as args.executionContext.path (projection scope)", () => {
    expect(emitExpr(ctx("locale"))).toBe("args.executionContext.locale");
    expect(emitExpr(ctx("locale", "region"))).toBe("args.executionContext.locale.region");
  });

  it("emits payloadRef as payload.path (binding discarded)", () => {
    expect(emitExpr(payload("p", "authorId"))).toBe("payload.authorId");
    expect(emitExpr(payload("p", "meta", "title"))).toBe("payload.meta.title");
  });

  it("emits identityRef as resource.key[0].path", () => {
    expect(emitExpr(identity("p", "id"))).toBe("resource.key[0].id");
    expect(emitExpr(identity("p"))).toBe("resource.key[0]");
  });

  it("emits itemRef via the comprehension binding", () => {
    expect(emitExpr(item("s", "id"))).toBe("s.id");
    expect(emitExpr(item("s"))).toBe("s");
  });

  it("emits binary == / != for comprehension filters", () => {
    const eq: Expr = {
      kind: "binary",
      op: "==",
      left: item("s", "type"),
      right: lit("Hero"),
      span: null,
    };
    const ne: Expr = {
      kind: "binary",
      op: "!=",
      left: item("s", "type"),
      right: lit("Tabs"),
      span: null,
    };
    expect(emitExpr(eq)).toBe('s.type == "Hero"');
    expect(emitExpr(ne)).toBe('s.type != "Tabs"');
  });
});

describe("projectionArmDiscriminant", () => {
  it("extracts string literal from binding.type == Lit", () => {
    expect(projectionArmDiscriminant(eq(payload("e", "type"), lit("Hero")), "e")).toBe("Hero");
    expect(projectionArmDiscriminant(eq(lit("Page"), payload("e", "type")), "e")).toBe("Page");
  });

  it("returns null for non-discriminant filters", () => {
    expect(projectionArmDiscriminant(eq(payload("e", "title"), lit("x")), "e")).toBeNull();
    expect(projectionArmDiscriminant(eq(payload("other", "type"), lit("Hero")), "e")).toBeNull();
    expect(projectionArmDiscriminant(lit("Hero"), "e")).toBeNull();
  });
});
