import { ari, s, type ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  createExpansionPolicyChain,
  defineExpansionPolicy,
  type ExpansionContext,
  type ExpansionPolicy,
} from "./expansion-port";
import { testAri } from "../testing/test-fixtures.js";
import type { ContentRegistry } from "../types";

const menuAri = ari("menu", s.object({ id: s.string() }));

type MenuRegistry = ContentRegistry & { menu: { kind?: string } };

function createContext(
  resource: ApplicationResourceIdentifier = testAri("page", "P"),
  payload: unknown = {}
): ExpansionContext<ContentRegistry, { locale: string }> {
  return {
    resource,
    payload: payload as ContentRegistry[keyof ContentRegistry],
    inheritedIslandId: resource.toString(),
    executionContext: { locale: "en" },
  };
}

function createMenuContext(
  resource: ReturnType<typeof menuAri>,
  payload: MenuRegistry["menu"]
): ExpansionContext<MenuRegistry, { locale: string }, ReturnType<typeof menuAri>> {
  return {
    resource,
    payload,
    inheritedIslandId: resource.toString(),
    executionContext: { locale: "en" },
  };
}

describe("createExpansionPolicyChain", () => {
  it("applies the first matching policy", () => {
    const menuChild = testAri("item", "1");
    const first: ExpansionPolicy = {
      matches: ({ resource }) => resource.type === "menu",
      expand: () => ({ resources: [menuChild], isIsland: true }),
    };
    const second: ExpansionPolicy = {
      matches: () => true,
      expand: () => ({ resources: [testAri("fallback", "X")] }),
    };
    const expandSpy = vi.spyOn(second, "expand");

    const port = createExpansionPolicyChain([first, second]);
    const result = port.expand(createContext(testAri("menu", "M")));

    expect(result).toEqual({ resources: [menuChild], isIsland: true });
    expect(expandSpy).not.toHaveBeenCalled();
  });

  it("skips non-matching policies", () => {
    const hero = testAri("hero", "H");
    const pagePolicy: ExpansionPolicy = {
      matches: ({ resource }) => resource.type === "page",
      expand: () => ({ resources: [hero] }),
    };
    const menuPolicy: ExpansionPolicy = {
      matches: ({ resource }) => resource.type === "menu",
      expand: () => ({ resources: [], isIsland: true }),
    };

    const port = createExpansionPolicyChain([menuPolicy, pagePolicy]);
    const result = port.expand(createContext(testAri("page", "P")));

    expect(result).toEqual({ resources: [hero] });
  });

  it("returns an empty expansion when no policy matches", () => {
    const port = createExpansionPolicyChain([
      {
        matches: ({ resource }) => resource.type === "menu",
        expand: () => ({ resources: [], isIsland: true }),
      },
    ]);

    expect(port.expand(createContext(testAri("page", "P")))).toEqual({
      resources: [],
    });
  });

  it("returns an empty expansion for an empty policy list", () => {
    const port = createExpansionPolicyChain([]);

    expect(port.expand(createContext())).toEqual({ resources: [] });
  });
});

describe("defineExpansionPolicy", () => {
  it("narrows resource and payload in expand from `for`", () => {
    const policy = defineExpansionPolicy<ReturnType<typeof menuAri>, MenuRegistry>({
      for: menuAri,
      expand: ({ resource, payload }) => {
        expectTypeOf(resource.type).toEqualTypeOf<"menu">();
        expectTypeOf(payload).toEqualTypeOf<{ kind?: string }>();
        expect(resource.type).toBe("menu");
        return { resources: [], isIsland: true };
      },
    });

    const port = createExpansionPolicyChain<MenuRegistry>([policy]);
    expect(port.expand(createMenuContext(menuAri({ id: "M" }), { kind: "main" }))).toEqual({
      resources: [],
      isIsland: true,
    });
  });

  it("passes narrowed context to `when`, including executionContext", () => {
    const when = vi.fn(
      (
        context: ExpansionContext<ContentRegistry, { locale: string }, ReturnType<typeof menuAri>>
      ) => {
        expect(context.executionContext).toEqual({ locale: "it" });
        expectTypeOf(context.resource.type).toEqualTypeOf<"menu">();
        return context.executionContext.locale === "it";
      }
    );

    const policy = defineExpansionPolicy({
      for: menuAri,
      when,
      expand: () => ({ resources: [], isIsland: true }),
    });

    const port = createExpansionPolicyChain([policy]);
    port.expand({
      ...createContext(menuAri({ id: "M" })),
      executionContext: { locale: "it" },
    });

    expect(when).toHaveBeenCalledOnce();
  });

  it("skips the policy when `when` returns false", () => {
    const expand = vi.fn(() => ({ resources: [testAri("fallback", "X")] }));

    const port = createExpansionPolicyChain([
      defineExpansionPolicy({
        for: menuAri,
        when: () => false,
        expand: () => ({ resources: [], isIsland: true }),
      }),
      {
        matches: () => true,
        expand,
      },
    ]);

    port.expand(createContext(menuAri({ id: "M" })));

    expect(expand).toHaveBeenCalledOnce();
  });

  it("refines on narrowed resource payload in `when`", () => {
    const policy = defineExpansionPolicy<ReturnType<typeof menuAri>, MenuRegistry>({
      for: menuAri,
      when: ({ payload }) => payload.kind === "main",
      expand: () => ({ resources: [], isIsland: true }),
    });

    const port = createExpansionPolicyChain<MenuRegistry>([policy]);
    expect(port.expand(createMenuContext(menuAri({ id: "M" }), { kind: "main" }))).toEqual({
      resources: [],
      isIsland: true,
    });
  });
});
