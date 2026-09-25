import { describe, expect, it } from "vitest";

import { checkProgram, type Program } from "../compile";

import {
  arg,
  construct,
  ctx,
  defScalar,
  expand,
  field,
  identity,
  lit,
  pageDetailProgram,
  param,
  payload,
  prim,
  projection,
  query,
  resource,
  scalarRef,
  span,
} from "../fixtures";

function cloneProgram(program: Program): Program {
  return JSON.parse(JSON.stringify(program)) as Program;
}

function withMutatedPageDetail(mutate: (program: Program) => void): Program {
  const program = cloneProgram(pageDetailProgram());
  mutate(program);
  return program;
}

function pageQuery(program: Program) {
  return program.queries.find((q) => q.name === "PageDetail")!;
}

function pageProjection(program: Program) {
  return pageQuery(program).projections.find((p) => p.binding === "p")!;
}

describe("checkProgram — pageDetail happy path", () => {
  it("typechecks the Page / Hero / Menu / Footer / Tabs / Tab / Asset / Product graph", () => {
    expect(checkProgram(pageDetailProgram())).toEqual([]);
  });
});

describe("checkProgram — negative diagnostics", () => {
  it("rejects Hero(id: @p.id) — PageId is not assignable to HeroId", () => {
    const program = withMutatedPageDetail((p) => {
      const hero = pageProjection(p).expansions.find((e) => e.alias === "hero")!;
      hero.target.args = [arg("id", identity("p", "id")), arg("locale", ctx("locale"))];
    });

    const diags = checkProgram(program);
    expect(diags).toContainEqual(
      expect.objectContaining({
        code: "TYPE_MISMATCH",
        message: expect.stringMatching(/PageId.*HeroId|HeroId.*PageId/),
      })
    );
  });

  it("rejects identity/payload semantic conflict on the same field name", () => {
    const program = withMutatedPageDetail((p) => {
      const page = p.resources.find((r) => r.name === "Page")!;
      const idPayload = page.payload.fields.find((f) => f.name === "id")!;
      idPayload.type = scalarRef("HeroId");
      idPayload.inheritedFromIdentity = false;
    });

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({ code: "IDENTITY_PAYLOAD_TYPE_MISMATCH" })
    );
  });

  it("rejects payload shorthand without a matching identity field", () => {
    const program = withMutatedPageDetail((p) => {
      const page = p.resources.find((r) => r.name === "Page")!;
      page.payload.fields.push(field("orphan", scalarRef("PageId"), true));
    });

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({ code: "SHORTHAND_NO_IDENTITY" })
    );
  });

  it("rejects unknown selected payload field", () => {
    const program = withMutatedPageDetail((p) => {
      pageProjection(p).selectedFields.push("notAField");
    });

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({ code: "UNKNOWN_SELECTED_FIELD" })
    );
  });

  it("rejects identityRef path missing on the resource", () => {
    const program = withMutatedPageDetail((p) => {
      const hero = pageProjection(p).expansions.find((e) => e.alias === "hero")!;
      hero.target.args = [arg("id", identity("p", "missing")), arg("locale", ctx("locale"))];
    });

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({ code: "UNKNOWN_IDENTITY_PATH" })
    );
  });

  it("rejects payloadRef to an identity-only field (locale)", () => {
    const program = withMutatedPageDetail((p) => {
      const hero = pageProjection(p).expansions.find((e) => e.alias === "hero")!;
      hero.target.args = [arg("id", payload("p", "heroId")), arg("locale", payload("p", "locale"))];
    });

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({ code: "UNKNOWN_PAYLOAD_PATH" })
    );
  });

  it("rejects identityRef when binding is not in scope", () => {
    const program = withMutatedPageDetail((p) => {
      const hero = pageProjection(p).expansions.find((e) => e.alias === "hero")!;
      hero.target.args = [arg("id", identity("noSuchBinding", "id")), arg("locale", ctx("locale"))];
    });

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({ code: "UNKNOWN_BINDING" })
    );
  });

  it("rejects missing constructor arg", () => {
    const program = withMutatedPageDetail((p) => {
      pageQuery(p).root.args = [arg("id", param("pageId"))];
    });

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({ code: "MISSING_CONSTRUCTOR_ARG" })
    );
  });

  it("rejects unknown constructor arg", () => {
    const program = withMutatedPageDetail((p) => {
      pageQuery(p).root.args.push(arg("extra", lit("x")));
    });

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({ code: "UNKNOWN_CONSTRUCTOR_ARG" })
    );
  });

  it("rejects typed string where PageId is expected (no primitive widening)", () => {
    const program = withMutatedPageDetail((p) => {
      pageQuery(p).parameters = [field("pageId", prim("string"))];
    });

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({
        code: "TYPE_MISMATCH",
        message: expect.stringContaining("string is not assignable to PageId"),
      })
    );
  });

  it("rejects unknown scalar ref", () => {
    const program = withMutatedPageDetail((p) => {
      const page = p.resources.find((r) => r.name === "Page")!;
      page.payload.fields.push(field("weird", scalarRef("NotAScalar")));
    });

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({ code: "UNKNOWN_SCALAR" })
    );
  });

  it("rejects duplicate scalar name", () => {
    const program = withMutatedPageDetail((p) => {
      p.scalars.push(defScalar("PageId", "string"));
    });

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({ code: "DUPLICATE_SCALAR" })
    );
  });

  it("rejects unknown resource in root / expand / on", () => {
    const program = withMutatedPageDetail((p) => {
      pageQuery(p).root.resource = "MissingRoot";
      pageProjection(p).expansions[0]!.target.resource = "MissingExpand";
      pageQuery(p).projections.push(projection("MissingOn", "x", ["id"]));
    });

    const codes = checkProgram(program).map((d) => d.code);
    expect(codes.filter((c) => c === "UNKNOWN_RESOURCE").length).toBeGreaterThanOrEqual(3);
  });

  it("rejects duplicate expansion alias within a projection", () => {
    const program = withMutatedPageDetail((p) => {
      const proj = pageProjection(p);
      proj.expansions.push(
        expand(
          "hero",
          construct("Hero", [arg("id", payload("p", "heroId")), arg("locale", ctx("locale"))])
        )
      );
    });

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({ code: "DUPLICATE_EXPANSION_ALIAS" })
    );
  });

  it("rejects constructor arg type mismatch (MenuId into HeroId)", () => {
    const program = withMutatedPageDetail((p) => {
      const page = pageQuery(p).projections.find((pr) => pr.binding === "p")!;
      const hero = page.expansions.find((e) => e.alias === "hero")!;
      hero.target.args = [arg("id", payload("p", "menuId")), arg("locale", ctx("locale"))];
    });

    // menuId is MenuId, Hero wants HeroId
    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({
        code: "TYPE_MISMATCH",
        message: expect.stringMatching(/MenuId.*HeroId/),
      })
    );
  });
});

describe("checkProgram — scalar / resource name clash", () => {
  it("rejects scalar name that clashes with a resource", () => {
    const program: Program = {
      span,
      scalars: [defScalar("Page", "string")],
      resources: [
        resource("Page", [field("id", scalarRef("Page"))], [field("id", scalarRef("Page"), true)]),
      ],
      queries: [
        query("Q", {
          parameters: [],
          context: [],
          root: construct("Page", [arg("id", lit("x"))]),
          projections: [],
        }),
      ],
    };

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({ code: "SCALAR_RESOURCE_NAME_CLASH" })
    );
  });
});
