import { ari, s } from "@xndrjs/application-resources";
import { describe, expect, expectTypeOf, it } from "vitest";

import { createStrategy } from "./create-strategy";
import { testAri } from "../testing/test-fixtures.js";
import type { ContentRegistry } from "../types";

const menuAri = ari("menu", s.object({ id: s.string() }));

type MenuRegistry = ContentRegistry & { menu: { kind?: string } };

describe("createStrategy", () => {
  it("builds separate expansion and island ports", () => {
    const child = testAri("item", "1");

    const strategy = createStrategy<{ locale: string }, MenuRegistry>()
      .expansion.on(menuAri)
      .expand(() => ({ resources: [child] }))
      .islands.on(menuAri)
      .when(({ payload }) => payload.kind === "main")
      .startIsland()
      .build();

    const context = {
      resource: menuAri({ id: "M" }),
      payload: { kind: "main" as const },
      executionContext: { locale: "en" },
    };

    expect(strategy.expansion.expand(context)).toEqual({ resources: [child] });
    expect(strategy.islands.resolve(context)).toEqual({ startIsland: true });
  });

  it("merges expansion policies registered as separate actions", () => {
    const first = testAri("item", "1");
    const second = testAri("item", "2");

    const strategy = createStrategy()
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

  it("narrows resource and payload in expansion actions", () => {
    createStrategy<{ locale: string }, MenuRegistry>()
      .expansion.on(menuAri)
      .expand(({ resource, payload }) => {
        expectTypeOf(resource.type).toEqualTypeOf<"menu">();
        expectTypeOf(payload).toEqualTypeOf<{ kind?: string }>();
        return { resources: [] };
      })
      .build();
  });
});
