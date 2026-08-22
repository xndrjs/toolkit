import { defineAri, s } from "@xndrjs/application-resources";
import { ari, type ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { ContentMap } from "./content-map";
import {
  createExpansionPolicyChain,
  defineExpansionPolicy,
  type ExpansionContext,
  type ExpansionPolicy,
} from "./expansion-port";
import type { ContentRegistry } from "./types";

const menuAri = defineAri("menu", s.object({ id: s.string() }));

function createContext(
  resource: ApplicationResourceIdentifier = ari("page", { id: "P" })
): ExpansionContext<ContentRegistry, { locale: string }> {
  return {
    resource,
    contentMap: new ContentMap(),
    inheritedIslandId: resource.format(),
    executionContext: { locale: "en" },
  };
}

describe("createExpansionPolicyChain", () => {
  it("applies the first matching policy", () => {
    const menuChild = ari("item", { id: "1" });
    const first: ExpansionPolicy = {
      matches: ({ resource }) => resource.type === "menu",
      expand: () => ({ resources: [menuChild], isIsland: true }),
    };
    const second: ExpansionPolicy = {
      matches: () => true,
      expand: () => ({ resources: [ari("fallback", { id: "X" })] }),
    };
    const expandSpy = vi.spyOn(second, "expand");

    const port = createExpansionPolicyChain([first, second]);
    const result = port.expand(createContext(ari("menu", { id: "M" })));

    expect(result).toEqual({ resources: [menuChild], isIsland: true });
    expect(expandSpy).not.toHaveBeenCalled();
  });

  it("skips non-matching policies", () => {
    const hero = ari("hero", { id: "H" });
    const pagePolicy: ExpansionPolicy = {
      matches: ({ resource }) => resource.type === "page",
      expand: () => ({ resources: [hero] }),
    };
    const menuPolicy: ExpansionPolicy = {
      matches: ({ resource }) => resource.type === "menu",
      expand: () => ({ resources: [], isIsland: true }),
    };

    const port = createExpansionPolicyChain([menuPolicy, pagePolicy]);
    const result = port.expand(createContext(ari("page", { id: "P" })));

    expect(result).toEqual({ resources: [hero] });
  });

  it("returns an empty expansion when no policy matches", () => {
    const port = createExpansionPolicyChain([
      {
        matches: ({ resource }) => resource.type === "menu",
        expand: () => ({ resources: [], isIsland: true }),
      },
    ]);

    expect(port.expand(createContext(ari("page", { id: "P" })))).toEqual({
      resources: [],
    });
  });

  it("returns an empty expansion for an empty policy list", () => {
    const port = createExpansionPolicyChain([]);

    expect(port.expand(createContext())).toEqual({ resources: [] });
  });
});

describe("defineExpansionPolicy", () => {
  it("narrows resource in expand from `for`", () => {
    const policy = defineExpansionPolicy({
      for: menuAri,
      expand: ({ resource }) => {
        expectTypeOf(resource.type).toEqualTypeOf<"menu">();
        expect(resource.type).toBe("menu");
        return { resources: [], isIsland: true };
      },
    });

    const port = createExpansionPolicyChain([policy]);
    expect(port.expand(createContext(menuAri({ id: "M" })))).toEqual({
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
    const expand = vi.fn(() => ({ resources: [ari("fallback", { id: "X" })] }));

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
    const contentMap = new ContentMap<ContentRegistry>();
    contentMap.set(menuAri({ id: "M" }), { kind: "main" });

    const policy = defineExpansionPolicy({
      for: menuAri,
      when: ({ contentMap, resource }) => contentMap.get(resource)?.kind === "main",
      expand: () => ({ resources: [], isIsland: true }),
    });

    const port = createExpansionPolicyChain([policy]);
    expect(
      port.expand({
        ...createContext(menuAri({ id: "M" })),
        contentMap,
      })
    ).toEqual({
      resources: [],
      isIsland: true,
    });
  });
});
