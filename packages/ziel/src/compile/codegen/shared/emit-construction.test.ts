import { describe, expect, it } from "vitest";

import { arg, construct, ctx, identity, item, param, payload } from "../../../fixtures";
import { emitConstruction } from "./emit-construction";

describe("emitConstruction", () => {
  it("emits ari factory with payload + empty-arg forms", () => {
    expect(emitConstruction(construct("User", [arg("id", payload("p", "authorId"))]))).toBe(
      "userAri({ id: payload.authorId })"
    );
    expect(emitConstruction(construct("Asset", []))).toBe("assetAri({})");
  });

  it("preserves named-arg order as written", () => {
    expect(
      emitConstruction(
        construct("Menu", [arg("id", payload("p", "menuId")), arg("locale", ctx("locale"))])
      )
    ).toBe("menuAri({ id: payload.menuId, locale: args.executionContext.locale })");
  });

  it("emits param, identity, and item refs in args", () => {
    expect(
      emitConstruction(
        construct("Post", [arg("id", param("postId")), arg("locale", ctx("locale"))])
      )
    ).toBe("postAri({ id: args.params.postId, locale: args.executionContext.locale })");

    expect(
      emitConstruction(
        construct("TabCollection", [
          arg("tabsId", identity("t", "id")),
          arg("locale", ctx("locale")),
        ])
      )
    ).toBe(
      "tabCollectionAri({ tabsId: resource.key[0].id, locale: args.executionContext.locale })"
    );

    expect(
      emitConstruction(
        construct("Hero", [arg("id", item("s", "id")), arg("locale", ctx("locale"))])
      )
    ).toBe("heroAri({ id: s.id, locale: args.executionContext.locale })");
  });
});
