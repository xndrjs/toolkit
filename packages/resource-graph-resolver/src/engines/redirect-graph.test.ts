import { describe, expect, it } from "vitest";

import { ResourceRedirectCycleError } from "../errors";
import { testAriFactory } from "../testing/test-fixtures";
import { RedirectGraph } from "./redirect-graph";

describe("RedirectGraph", () => {
  const locatorAri = testAriFactory("locator");
  const targetAri = testAriFactory("target");

  it("returns no redirect for an unlinked resource", () => {
    const graph = new RedirectGraph();
    const resource = locatorAri({ id: "A" });

    expect(graph.redirectOf(resource)).toBeUndefined();
    expect(graph.canonicalOf(resource)).toBe(resource);
    expect(graph.aliasesOf(resource)).toEqual([]);
    expect(graph.snapshot()).toEqual(new Map());
  });

  it("flattens chains and retains every reverse alias", () => {
    const graph = new RedirectGraph();
    const first = locatorAri({ id: "A" });
    const second = locatorAri({ id: "B" });
    const canonical = targetAri({ id: "C" });

    expect(graph.link(first, second)).toBe(second);
    expect(graph.link(second, canonical)).toBe(canonical);
    expect(graph.canonicalOf(first)).toBe(canonical);
    expect(graph.aliasesOf(canonical)).toEqual([first.toString(), second.toString()].sort());
    expect(graph.snapshot()).toEqual(
      new Map([
        [first.toString(), canonical],
        [second.toString(), canonical],
      ])
    );
  });

  it("links directly to an already-canonical target", () => {
    const graph = new RedirectGraph();
    const first = locatorAri({ id: "A" });
    const second = locatorAri({ id: "B" });
    const third = locatorAri({ id: "C" });
    const canonical = targetAri({ id: "D" });

    graph.link(second, third);
    graph.link(third, canonical);
    expect(graph.link(first, second)).toBe(canonical);

    expect(graph.snapshot()).toEqual(
      new Map([
        [first.toString(), canonical],
        [second.toString(), canonical],
        [third.toString(), canonical],
      ])
    );
  });

  it("rejects self redirects", () => {
    const graph = new RedirectGraph();
    const resource = locatorAri({ id: "A" });

    expect(() => graph.link(resource, resource)).toThrowError(
      new ResourceRedirectCycleError([resource.toString(), resource.toString()])
    );
  });

  it("rejects two-node redirect cycles", () => {
    const graph = new RedirectGraph();
    const first = locatorAri({ id: "A" });
    const second = locatorAri({ id: "B" });
    graph.link(first, second);

    expect(() => graph.link(second, first)).toThrowError(
      new ResourceRedirectCycleError([second.toString(), first.toString(), second.toString()])
    );
  });

  it("rejects longer redirect cycles with the complete cycle path", () => {
    const graph = new RedirectGraph();
    const first = locatorAri({ id: "A" });
    const second = locatorAri({ id: "B" });
    const third = locatorAri({ id: "C" });
    graph.link(first, second);
    graph.link(second, third);

    expect(() => graph.link(third, first)).toThrowError(
      new ResourceRedirectCycleError([
        third.toString(),
        first.toString(),
        second.toString(),
        third.toString(),
      ])
    );
  });
});
