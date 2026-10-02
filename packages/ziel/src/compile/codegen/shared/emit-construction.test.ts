import { describe, expect, it } from "vitest";

import { arg, construct, identity, item, param, payload } from "../../../fixtures";
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
        construct("Menu", [arg("id", payload("p", "menuId")), arg("locale", param("locale"))])
      )
    ).toBe("menuAri({ id: payload.menuId, locale: args.params.locale })");
  });

  it("emits param, identity, and item refs in args", () => {
    expect(
      emitConstruction(
        construct("Post", [arg("id", param("postId")), arg("locale", param("locale"))])
      )
    ).toBe("postAri({ id: args.params.postId, locale: args.params.locale })");

    expect(
      emitConstruction(
        construct("TabCollection", [
          arg("tabsId", identity("t", "id")),
          arg("locale", param("locale")),
        ])
      )
    ).toBe("tabCollectionAri({ tabsId: resource.key.id, locale: args.params.locale })");

    expect(
      emitConstruction(
        construct("Hero", [arg("id", item("s", "id")), arg("locale", param("locale"))])
      )
    ).toBe("heroAri({ id: s.id, locale: args.params.locale })");
  });
});
