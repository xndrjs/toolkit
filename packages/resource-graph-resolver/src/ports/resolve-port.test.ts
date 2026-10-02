import { ari, s, type AddressableResourceIdentifier } from "@xndrjs/addressable-resources";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  createResolvePolicyChain,
  defineResolvePolicy,
  type ResolveContext,
  type ResolvePolicy,
} from "./resolve-port";
import { testAri } from "../testing/test-fixtures.js";
import type { ContentRegistry } from "../types";

const customRefAri = ari("customRef", s.object({ id: s.string() }));

type CustomRefRegistry = ContentRegistry & {
  customRef: { type: "Entry" | "Asset"; id: string };
};

function createContext(
  resource: AddressableResourceIdentifier = testAri("customRef", "C"),
  payload: unknown = {}
): ResolveContext<ContentRegistry, { locale: string }> {
  return {
    resource,
    payload: payload as ContentRegistry[keyof ContentRegistry],
    executionContext: { locale: "en" },
  };
}

describe("createResolvePolicyChain", () => {
  it("returns the first matching policy target", () => {
    const entry = testAri("entry", "1");
    const asset = testAri("asset", "1");

    const first: ResolvePolicy = {
      matches: ({ payload }) => (payload as { type?: string }).type === "Entry",
      resolve: () => ({ resource: entry }),
    };
    const second: ResolvePolicy = {
      matches: ({ payload }) => (payload as { type?: string }).type === "Asset",
      resolve: () => ({ resource: asset }),
    };

    const port = createResolvePolicyChain([first, second]);

    expect(
      port.resolve(createContext(testAri("customRef", "C"), { type: "Entry", id: "1" }))
    ).toEqual({ resource: entry });
    expect(
      port.resolve(createContext(testAri("customRef", "C"), { type: "Asset", id: "1" }))
    ).toEqual({ resource: asset });
  });

  it("returns undefined when no policy matches", () => {
    const port = createResolvePolicyChain([
      {
        matches: () => false,
        resolve: () => ({ resource: testAri("entry", "1") }),
      },
    ]);

    expect(port.resolve(createContext())).toBeUndefined();
  });

  it("returns undefined for an empty chain", () => {
    expect(createResolvePolicyChain([]).resolve(createContext())).toBeUndefined();
  });

  it("does not consult later policies after the first match", () => {
    const first = testAri("entry", "1");
    const second = testAri("entry", "2");
    let secondCalled = false;

    const port = createResolvePolicyChain([
      {
        matches: () => true,
        resolve: () => ({ resource: first }),
      },
      {
        matches: () => true,
        resolve: () => {
          secondCalled = true;
          return { resource: second };
        },
      },
    ]);

    expect(port.resolve(createContext())).toEqual({ resource: first });
    expect(secondCalled).toBe(false);
  });
});

describe("defineResolvePolicy", () => {
  it("narrows resource and payload for when/to", () => {
    const entry = testAri("entry", "123");

    const policy = defineResolvePolicy<
      ReturnType<typeof customRefAri>,
      CustomRefRegistry,
      { locale: string }
    >({
      for: customRefAri,
      when: ({ payload }) => {
        expectTypeOf(payload).toEqualTypeOf<CustomRefRegistry["customRef"]>();
        return payload.type === "Entry";
      },
      to: ({ resource, payload }) => {
        expectTypeOf(resource.type).toEqualTypeOf<"customRef">();
        expectTypeOf(payload).toEqualTypeOf<CustomRefRegistry["customRef"]>();
        return { resource: entry };
      },
    });

    const context: ResolveContext<
      CustomRefRegistry,
      { locale: string },
      ReturnType<typeof customRefAri>
    > = {
      resource: customRefAri({ id: "master@foo|ENTRY|123" }),
      payload: { type: "Entry", id: "123" },
      executionContext: { locale: "en" },
    };

    expect(policy.matches(context)).toBe(true);
    expect(policy.resolve(context)).toEqual({ resource: entry });
  });

  it("rejects when the for matcher fails", () => {
    const policy = defineResolvePolicy({
      for: customRefAri,
      to: () => ({ resource: testAri("entry", "1") }),
    });

    expect(policy.matches(createContext(testAri("page", "P")))).toBe(false);
  });
});
