import { describe, expect, it } from "vitest";

import { MissingResourceError, ResourceRedirectCycleError } from "../errors";
import { createGraphResolutionStrategy } from "../strategy/create-graph-resolution-strategy";
import { createStoreSource } from "../testing/resolver-test-helpers";
import { pageAri, testAriFactory } from "../testing/test-fixtures";
import type { OnFailurePolicy, SchedulingMode } from "../types";
import { createResourceGraphResolver } from "./resource-graph-resolver";

type LocatorPayload = {
  kind: "locator" | "target";
  id: string;
};

const locatorAri = testAriFactory("redirectLocator");
const targetAri = testAriFactory("redirectTarget");

const schedulingModes: readonly SchedulingMode[] = ["lane", "barrier"];

function createRedirectStrategy(
  children: readonly ReturnType<typeof locatorAri | typeof targetAri>[],
  policies: ReadonlyMap<string, OnFailurePolicy> = new Map()
) {
  return createGraphResolutionStrategy()
    .expansion.on(pageAri)
    .expand(() => ({
      resources: children,
      onFailure: "throw",
      onFailureByKey: policies,
    }))
    .expansion.on(targetAri)
    .expand(() => ({ resources: [] }))
    .resolve.on(locatorAri)
    .to(({ payload }) => {
      const locator = payload as LocatorPayload;
      return {
        resource:
          locator.kind === "locator"
            ? locatorAri({ id: locator.id })
            : targetAri({ id: locator.id }),
      };
    })
    .build();
}

function redirectStore(entries: readonly [string, unknown][]): Map<string, unknown> {
  return new Map(entries);
}

function redirectKeys(redirects: ReadonlyMap<string, { toString(): string }>): Map<string, string> {
  return new Map([...redirects].map(([alias, canonical]) => [alias, canonical.toString()]));
}

describe.each(schedulingModes)("redirect invariants (%s scheduling mode)", (schedulingMode) => {
  it("settles a locator through a canonical target and overwrites its decode payload", async () => {
    const root = pageAri({ id: "P" });
    const locator = locatorAri({ id: "A" });
    const target = targetAri({ id: "T" });
    const targetPayload = { title: "Canonical" };
    const source = createStoreSource({
      for: [pageAri, locatorAri, targetAri],
      store: redirectStore([
        [root.toString(), {}],
        [locator.toString(), { kind: "target", id: "T" }],
        [target.toString(), targetPayload],
      ]),
    });
    const resolver = createResourceGraphResolver({
      sources: [source],
      strategy: createRedirectStrategy([locator]),
      schedulingMode,
    });

    const output = await resolver.resolve({ roots: [root], executionContext: {} });

    expect(output.contentMap.get(locator)).toBe(targetPayload);
    expect(output.contentMap.get(target)).toBe(targetPayload);
    expect(redirectKeys(output.redirects)).toEqual(
      new Map([[locator.toString(), target.toString()]])
    );
    expect(output.errors).toEqual([]);
    expect(output.failures).toEqual(new Map());
    expect(source.batches.flat().filter((resource) => resource.equals(target))).toHaveLength(1);
  });

  it("flattens a chain and converges direct and aliased requests on one target", async () => {
    const root = pageAri({ id: "P" });
    const first = locatorAri({ id: "A" });
    const second = locatorAri({ id: "B" });
    const target = targetAri({ id: "T" });
    const targetPayload = { title: "Shared" };
    const source = createStoreSource({
      for: [pageAri, locatorAri, targetAri],
      store: redirectStore([
        [root.toString(), {}],
        [first.toString(), { kind: "locator", id: "B" }],
        [second.toString(), { kind: "target", id: "T" }],
        [target.toString(), targetPayload],
      ]),
    });
    const resolver = createResourceGraphResolver({
      sources: [source],
      strategy: createRedirectStrategy([first, target]),
      schedulingMode,
    });

    const output = await resolver.resolve({ roots: [root], executionContext: {} });

    expect(redirectKeys(output.redirects)).toEqual(
      new Map([
        [first.toString(), target.toString()],
        [second.toString(), target.toString()],
      ])
    );
    expect(output.contentMap.get(first)).toBe(targetPayload);
    expect(output.contentMap.get(second)).toBe(targetPayload);
    expect(output.contentMap.get(target)).toBe(targetPayload);
    expect(source.batches.flat().filter((resource) => resource.equals(target))).toHaveLength(1);
  });

  it("propagates a target promoted from backing resources to every alias", async () => {
    const root = pageAri({ id: "P" });
    const first = locatorAri({ id: "A" });
    const second = locatorAri({ id: "B" });
    const target = targetAri({ id: "T" });
    const targetPayload = { title: "From backing" };
    const source = createStoreSource({
      for: [pageAri, locatorAri, targetAri],
      store: redirectStore([
        [root.toString(), {}],
        [first.toString(), { kind: "locator", id: "B" }],
        [second.toString(), { kind: "target", id: "T" }],
      ]),
    });
    const resolver = createResourceGraphResolver({
      sources: [source],
      strategy: createRedirectStrategy([first]),
      schedulingMode,
    });

    const output = await resolver.resolve({
      roots: [root],
      executionContext: {},
      backingResources: new Map([[target.toString(), targetPayload]]),
    });

    expect(output.promotedResourceKeys).toContain(target.toString());
    expect(output.contentMap.get(first)).toBe(targetPayload);
    expect(output.contentMap.get(second)).toBe(targetPayload);
    expect(output.contentMap.get(target)).toBe(targetPayload);
    expect(source.batches.flat().some((resource) => resource.equals(target))).toBe(false);
  });

  it("applies redirect policies to locator decode payloads promoted from backing", async () => {
    const root = pageAri({ id: "P" });
    const locator = locatorAri({ id: "A" });
    const target = targetAri({ id: "T" });
    const targetPayload = { title: "Loaded target" };
    const source = createStoreSource({
      for: [pageAri, locatorAri, targetAri],
      store: redirectStore([
        [root.toString(), {}],
        [target.toString(), targetPayload],
      ]),
    });
    const resolver = createResourceGraphResolver({
      sources: [source],
      strategy: createRedirectStrategy([locator]),
      schedulingMode,
    });

    const output = await resolver.resolve({
      roots: [root],
      executionContext: {},
      backingResources: new Map([
        [locator.toString(), { kind: "target", id: "T" } satisfies LocatorPayload],
      ]),
    });

    expect(output.promotedResourceKeys).toContain(locator.toString());
    expect(output.contentMap.get(locator)).toBe(targetPayload);
    expect(output.contentMap.get(target)).toBe(targetPayload);
    expect(source.batches.flat().some((resource) => resource.equals(locator))).toBe(false);
  });

  it.each(["setNull", "setError"] as const)(
    "aliases one canonical failure under %s",
    async (onFailure) => {
      const root = pageAri({ id: "P" });
      const first = locatorAri({ id: "A" });
      const second = locatorAri({ id: "B" });
      const target = targetAri({ id: "T" });
      const source = createStoreSource({
        for: [pageAri, locatorAri, targetAri],
        store: redirectStore([
          [root.toString(), {}],
          [first.toString(), { kind: "locator", id: "B" }],
          [second.toString(), { kind: "target", id: "T" }],
        ]),
      });
      const resolver = createResourceGraphResolver({
        sources: [source],
        strategy: createRedirectStrategy([first], new Map([[first.toString(), onFailure]])),
        schedulingMode,
      });

      const output = await resolver.resolve({ roots: [root], executionContext: {} });

      expect(output.errors).toHaveLength(1);
      const error = output.errors[0]!;
      expect(error.resourceKey).toBe(target.toString());
      expect(output.failures.get(target.toString())).toBe(error);
      expect(output.failures.get(first.toString())).toBe(error);
      expect(output.failures.get(second.toString())).toBe(error);
      expect(output.contentMap.has(first)).toBe(false);
      expect(output.contentMap.has(second)).toBe(false);
      expect(output.contentMap.has(target)).toBe(false);
    }
  );

  it("keeps throw strict across a redirect", async () => {
    const root = pageAri({ id: "P" });
    const locator = locatorAri({ id: "A" });
    const source = createStoreSource({
      for: [pageAri, locatorAri, targetAri],
      store: redirectStore([
        [root.toString(), {}],
        [locator.toString(), { kind: "target", id: "missing" }],
      ]),
    });
    const resolver = createResourceGraphResolver({
      sources: [source],
      strategy: createRedirectStrategy([locator]),
      schedulingMode,
    });

    await expect(resolver.resolve({ roots: [root], executionContext: {} })).rejects.toBeInstanceOf(
      MissingResourceError
    );
  });

  it("uses the strictest policy across a locator and its directly requested target", async () => {
    const root = pageAri({ id: "P" });
    const locator = locatorAri({ id: "A" });
    const target = targetAri({ id: "T" });
    const source = createStoreSource({
      for: [pageAri, locatorAri, targetAri],
      store: redirectStore([
        [root.toString(), {}],
        [locator.toString(), { kind: "target", id: "T" }],
      ]),
    });
    const resolver = createResourceGraphResolver({
      sources: [source],
      strategy: createRedirectStrategy(
        [locator, target],
        new Map([
          [locator.toString(), "setNull"],
          [target.toString(), "setError"],
        ])
      ),
      schedulingMode,
    });

    const output = await resolver.resolve({ roots: [root], executionContext: {} });

    expect(output.errors).toHaveLength(1);
    expect(output.failures.get(locator.toString())).toBe(output.errors[0]);
    expect(output.failures.get(target.toString())).toBe(output.errors[0]);
  });
});

describe("redirect cycle safety", () => {
  it("rejects a self redirect", async () => {
    const locator = locatorAri({ id: "A" });
    const source = createStoreSource({
      for: [locatorAri],
      store: redirectStore([[locator.toString(), { kind: "locator", id: "A" }]]),
    });
    const resolver = createResourceGraphResolver({
      sources: [source],
      strategy: createRedirectStrategy([]),
    });

    await expect(
      resolver.resolve({ roots: [locator], executionContext: {} })
    ).rejects.toMatchObject({
      name: "ResourceRedirectCycleError",
      resourceKeys: [locator.toString(), locator.toString()],
    } satisfies Partial<ResourceRedirectCycleError>);
  });

  it("rejects a two-node redirect cycle", async () => {
    const first = locatorAri({ id: "A" });
    const second = locatorAri({ id: "B" });
    const source = createStoreSource({
      for: [locatorAri],
      store: redirectStore([
        [first.toString(), { kind: "locator", id: "B" }],
        [second.toString(), { kind: "locator", id: "A" }],
      ]),
    });
    const resolver = createResourceGraphResolver({
      sources: [source],
      strategy: createRedirectStrategy([]),
    });

    await expect(resolver.resolve({ roots: [first], executionContext: {} })).rejects.toBeInstanceOf(
      ResourceRedirectCycleError
    );
  });

  it("rejects a longer redirect cycle", async () => {
    const first = locatorAri({ id: "A" });
    const second = locatorAri({ id: "B" });
    const third = locatorAri({ id: "C" });
    const source = createStoreSource({
      for: [locatorAri],
      store: redirectStore([
        [first.toString(), { kind: "locator", id: "B" }],
        [second.toString(), { kind: "locator", id: "C" }],
        [third.toString(), { kind: "locator", id: "A" }],
      ]),
    });
    const resolver = createResourceGraphResolver({
      sources: [source],
      strategy: createRedirectStrategy([]),
    });

    await expect(resolver.resolve({ roots: [first], executionContext: {} })).rejects.toMatchObject({
      name: "ResourceRedirectCycleError",
      resourceKeys: [third.toString(), first.toString(), second.toString(), third.toString()],
    } satisfies Partial<ResourceRedirectCycleError>);
  });
});
