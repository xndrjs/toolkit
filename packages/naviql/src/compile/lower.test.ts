import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { checkProgram } from "../check";
import { pageDetailProgram } from "../fixtures";
import { isModel, type Model } from "../lang/generated/ast";
import { createNaviQlServices } from "../lang/naviql-module";
import type { SourceSpan } from "../ir";
import { lowerProgram } from "./lower";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");

function parseSource(source: string): Model {
  const { NaviQl } = createNaviQlServices();
  const result = NaviQl.parser.LangiumParser.parse(source);
  expect(result.parserErrors, JSON.stringify(result.parserErrors)).toEqual([]);
  expect(result.lexerErrors, JSON.stringify(result.lexerErrors)).toEqual([]);
  expect(isModel(result.value)).toBe(true);
  return result.value as Model;
}

function stripSpans(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripSpans);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = key === "span" ? null : stripSpans(child);
    }
    return out;
  }
  return value;
}

function expectSpan(span: SourceSpan | null | undefined): asserts span is SourceSpan {
  expect(span).toEqual(
    expect.objectContaining({
      start: expect.any(Number),
      end: expect.any(Number),
      uri: null,
    })
  );
  expect(span!.end).toBeGreaterThan(span!.start);
}

describe("lowerProgram", () => {
  it("lowers page-detail.naviql to IR that typechecks and matches the fixture (spans ignored)", () => {
    const source = readFileSync(join(fixturesDir, "page-detail.naviql"), "utf8");
    const program = lowerProgram(parseSource(source));

    expect(checkProgram(program)).toEqual([]);
    expect(stripSpans(program)).toEqual(stripSpans(pageDetailProgram()));
  });

  it("sets ariType=name, payload shorthand, PathRef classification, and CST spans", () => {
    const program = lowerProgram(
      parseSource(`
        scalar PostId on string;
        scalar UserId on string;

        resource Post(id: PostId) {
          id
          authorId: UserId
        }

        resource User(id: UserId) {
          id
        }

        query PostDetail(postId: PostId) {
          root Post(id: postId)
          on Post p {
            id
            expand author: User(id: p.authorId)
            expand self: User(id: @p.id)
          }
        }
      `)
    );

    const post = program.resources.find((r) => r.name === "Post");
    expect(post?.ariType).toBe("Post");
    expect(post?.payload.fields[0]).toMatchObject({
      name: "id",
      inheritedFromIdentity: true,
      type: { kind: "scalarRef", name: "PostId" },
    });
    expect(post?.payload.fields[1]?.inheritedFromIdentity).toBe(false);

    const query = program.queries[0]!;
    expect(query.root.args[0]?.value).toMatchObject({ kind: "param", name: "postId" });
    expect(query.projections[0]?.expansions[0]?.target.args[0]?.value).toMatchObject({
      kind: "payloadRef",
      binding: "p",
      path: ["authorId"],
    });
    expect(query.projections[0]?.expansions[1]?.target.args[0]?.value).toMatchObject({
      kind: "identityRef",
      binding: "p",
      path: ["id"],
    });
    expect(query.projections[0]?.expansions[0]?.multiplicity).toBe("one");

    expectSpan(program.span);
    expectSpan(post?.span);
    expectSpan(query.span);
    expectSpan(query.root.span);
  });

  it("lowers literals without collapsing scalarRef types", () => {
    const program = lowerProgram(
      parseSource(`
        scalar Id on string;
        resource R(id: Id) { id }
        query Q(x: Id) {
          root R(id: x, a: "hi", n: 1.5, t: true, z: null)
        }
      `)
    );

    const args = program.queries[0]!.root.args;
    expect(args.map((a) => a.value)).toEqual([
      expect.objectContaining({ kind: "param", name: "x" }),
      expect.objectContaining({ kind: "literal", value: "hi" }),
      expect.objectContaining({ kind: "literal", value: 1.5 }),
      expect.objectContaining({ kind: "literal", value: true }),
      expect.objectContaining({ kind: "literal", value: null }),
    ]);

    expect(program.resources[0]?.identity.fields[0]?.type).toEqual(
      expect.objectContaining({ kind: "scalarRef", name: "Id" })
    );
  });
});
