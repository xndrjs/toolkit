import { describe, expect, it } from "vitest";

import { ctx, identity, item, lit, param, payload } from "../../fixtures";
import type { Expr } from "../../ir";
import { emitExpr } from "./emit-expr";

describe("emitExpr", () => {
  it("emits literals", () => {
    expect(emitExpr(lit("Hero"))).toBe('"Hero"');
    expect(emitExpr(lit(1.5))).toBe("1.5");
    expect(emitExpr(lit(true))).toBe("true");
    expect(emitExpr(lit(null))).toBe("null");
  });

  it("emits params as params.name", () => {
    expect(emitExpr(param("postId"))).toBe("params.postId");
  });

  it("emits context as executionContext.path", () => {
    expect(emitExpr(ctx("locale"))).toBe("executionContext.locale");
    expect(emitExpr(ctx("locale", "region"))).toBe("executionContext.locale.region");
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
