import { ari, s } from "@xndrjs/addressable-resources";
import { describe, expect, expectTypeOf, it } from "vitest";

import { createGraphResolutionStrategy } from "./create-graph-resolution-strategy";
import { testAri } from "../testing/test-fixtures.js";
import type { ContentRegistry } from "../types";

const menuAri = ari("menu", s.object({ id: s.string() }));
const customRefAri = ari("customRef", s.object({ id: s.string() }));

type MenuRegistry = ContentRegistry & { menu: { kind?: string } };
type CustomRefRegistry = ContentRegistry & {
  customRef: { type: "Entry" | "Asset"; id: string };
};

describe("createGraphResolutionStrategy", () => {
  it("builds separate expansion, island, and resolve ports", () => {
    const child = testAri("item", "1");
    const entry = testAri("entry", "1");

    const strategy = createGraphResolutionStrategy<
      { locale: string },
      MenuRegistry & CustomRefRegistry
    >()
      .expansion.on(menuAri)
      .expand(() => ({ resources: [child] }))
      .islands.on(menuAri)
      .when(({ payload }) => payload.kind === "main")
      .startIsland()
      .resolve.on(customRefAri)
      .when(({ payload }) => payload.type === "Entry")
      .to(() => ({ resource: entry }))
      .build();

    const expansionContext = {
      resource: menuAri({ id: "M" }),
      payload: { kind: "main" as const },
      executionContext: { locale: "en" },
    };

    expect(strategy.expansion.expand(expansionContext)).toEqual({ resources: [child] });
    expect(strategy.islands.resolve(expansionContext)).toEqual({ startIsland: true });
    expect(
      strategy.resolve.resolve({
        resource: customRefAri({ id: "C" }),
        payload: { type: "Entry", id: "1" },
        executionContext: { locale: "en" },
      })
    ).toEqual({ resource: entry });
  });

  it("merges expansion policies registered as separate actions", () => {
    const first = testAri("item", "1");
    const second = testAri("item", "2");

    const strategy = createGraphResolutionStrategy()
      .expansion.on(menuAri)
      .expand(() => ({ resources: [first] }))
      .expansion.on(menuAri)
      .expand(() => ({ resources: [second] }))
      .build();

    expect(
      strategy.expansion.expand({
        resource: menuAri({ id: "M" }),
        payload: {},
        executionContext: {},
      })
    ).toEqual({ resources: [first, second] });
  });

  it("takes the first matching resolve policy", () => {
    const entry = testAri("entry", "1");
    const asset = testAri("asset", "1");

    const strategy = createGraphResolutionStrategy<unknown, CustomRefRegistry>()
      .resolve.on(customRefAri)
      .when(({ payload }) => payload.type === "Entry")
      .to(() => ({ resource: entry }))
      .resolve.on(customRefAri)
      .when(({ payload }) => payload.type === "Asset")
      .to(() => ({ resource: asset }))
      .build();

    expect(
      strategy.resolve.resolve({
        resource: customRefAri({ id: "C" }),
        payload: { type: "Asset", id: "1" },
        executionContext: {},
      })
    ).toEqual({ resource: asset });
  });

  it("narrows resource and payload in expansion actions", () => {
    createGraphResolutionStrategy<{ locale: string }, MenuRegistry>()
      .expansion.on(menuAri)
      .expand(({ resource, payload }) => {
        expectTypeOf(resource.type).toEqualTypeOf<"menu">();
        expectTypeOf(payload).toEqualTypeOf<{ kind?: string }>();
        return { resources: [] };
      })
      .build();
  });

  it("narrows resource and payload in resolve actions", () => {
    createGraphResolutionStrategy<{ locale: string }, CustomRefRegistry>()
      .resolve.on(customRefAri)
      .when(({ payload }) => {
        expectTypeOf(payload).toEqualTypeOf<CustomRefRegistry["customRef"]>();
        return payload.type === "Entry";
      })
      .to(({ resource, payload }) => {
        expectTypeOf(resource.type).toEqualTypeOf<"customRef">();
        expectTypeOf(payload).toEqualTypeOf<CustomRefRegistry["customRef"]>();
        return { resource: testAri("entry", payload.id) };
      })
      .build();
  });
});
