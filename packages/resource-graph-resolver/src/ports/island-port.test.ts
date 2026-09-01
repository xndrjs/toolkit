import { ari, s, type ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  createIslandPolicyChain,
  defineIslandPolicy,
  type IslandContext,
  type IslandPolicy,
} from "./island-port";
import { testAri } from "../testing/test-fixtures.js";
import type { ContentRegistry } from "../types";

const menuAri = ari("menu", s.object({ id: s.string() }));

type MenuRegistry = ContentRegistry & { menu: { kind?: string } };

function createContext(
  resource: ApplicationResourceIdentifier = testAri("page", "P"),
  payload: unknown = {}
): IslandContext<ContentRegistry, { locale: string }> {
  return {
    resource,
    payload: payload as ContentRegistry[keyof ContentRegistry],
    executionContext: { locale: "en" },
  };
}

function createMenuContext(
  resource: ReturnType<typeof menuAri>,
  payload: MenuRegistry["menu"]
): IslandContext<MenuRegistry, { locale: string }, ReturnType<typeof menuAri>> {
  return {
    resource,
    payload,
    executionContext: { locale: "en" },
  };
}

describe("createIslandPolicyChain", () => {
  it("OR-merges matching policies", () => {
    const menuPolicy: IslandPolicy = {
      matches: ({ resource }) => resource.type === "menu",
      resolve: () => ({ startIsland: true }),
    };
    const footerPolicy: IslandPolicy = {
      matches: ({ resource }) => resource.type === "footer",
      resolve: () => ({ startIsland: true }),
    };

    const port = createIslandPolicyChain([menuPolicy, footerPolicy]);

    expect(port.resolve(createContext(testAri("menu", "M")))).toEqual({ startIsland: true });
    expect(port.resolve(createContext(testAri("footer", "F")))).toEqual({ startIsland: true });
    expect(port.resolve(createContext(testAri("page", "P")))).toEqual({ startIsland: false });
  });

  it("uses the first explicit island id when several policies match", () => {
    const first: IslandPolicy = {
      matches: () => true,
      resolve: () => ({ startIsland: true, islandId: "first" }),
    };
    const second: IslandPolicy = {
      matches: () => true,
      resolve: () => ({ startIsland: true, islandId: "second" }),
    };

    const port = createIslandPolicyChain([first, second]);
    expect(port.resolve(createContext())).toEqual({ startIsland: true, islandId: "first" });
  });

  it("returns no island when no policy matches", () => {
    const port = createIslandPolicyChain([
      {
        matches: ({ resource }) => resource.type === "menu",
        resolve: () => ({ startIsland: true }),
      },
    ]);

    expect(port.resolve(createContext(testAri("page", "P")))).toEqual({ startIsland: false });
  });
});

describe("defineIslandPolicy", () => {
  it("narrows resource and payload from `for`", () => {
    const policy = defineIslandPolicy<ReturnType<typeof menuAri>, MenuRegistry>({
      for: menuAri,
      startIsland: ({ resource, payload }) => {
        expectTypeOf(resource.type).toEqualTypeOf<"menu">();
        expectTypeOf(payload).toEqualTypeOf<{ kind?: string }>();
        expect(resource.type).toBe("menu");
        return true;
      },
    });

    const port = createIslandPolicyChain<MenuRegistry>([policy]);
    expect(port.resolve(createMenuContext(menuAri({ id: "M" }), { kind: "main" }))).toEqual({
      startIsland: true,
    });
  });

  it("passes narrowed context to `when`, including executionContext", () => {
    const when = vi.fn(
      (context: IslandContext<ContentRegistry, { locale: string }, ReturnType<typeof menuAri>>) => {
        expect(context.executionContext).toEqual({ locale: "it" });
        expectTypeOf(context.resource.type).toEqualTypeOf<"menu">();
        return context.executionContext.locale === "it";
      }
    );

    const policy = defineIslandPolicy({
      for: menuAri,
      when,
      startIsland: () => true,
    });

    const port = createIslandPolicyChain([policy]);
    port.resolve({
      ...createContext(menuAri({ id: "M" })),
      executionContext: { locale: "it" },
    });

    expect(when).toHaveBeenCalledOnce();
  });

  it("skips the policy when `when` returns false", () => {
    const resolve = vi.fn(() => ({ startIsland: true }));

    const port = createIslandPolicyChain([
      defineIslandPolicy({
        for: menuAri,
        when: () => false,
        startIsland: () => true,
      }),
      {
        matches: () => true,
        resolve,
      },
    ]);

    port.resolve(createContext(menuAri({ id: "M" })));

    expect(resolve).toHaveBeenCalledOnce();
  });

  it("supports a custom island id from `startIsland`", () => {
    const policy = defineIslandPolicy<ReturnType<typeof menuAri>, MenuRegistry>({
      for: menuAri,
      when: ({ payload }) => payload.kind === "main",
      startIsland: () => "menu:main",
    });

    const port = createIslandPolicyChain<MenuRegistry>([policy]);
    expect(port.resolve(createMenuContext(menuAri({ id: "M" }), { kind: "main" }))).toEqual({
      startIsland: true,
      islandId: "menu:main",
    });
  });
});
