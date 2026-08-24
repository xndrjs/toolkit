import { describe, expect, it, vi } from "vitest";

import { GraphResolutionSession } from "./graph-resolution-session";
import { testAri } from "../testing/test-fixtures.js";
import type { ResolveContentGraphInput } from "../types";

const page = testAri("page", "P");
const menu = testAri("menu", "M");
const footer = testAri("footer", "F");
const asset = testAri("asset", "A");

function createInput(overrides: Partial<ResolveContentGraphInput> = {}): ResolveContentGraphInput {
  return {
    root: page,
    executionContext: {},
    missingResourceMode: "collect",
    ...overrides,
  };
}

describe("GraphResolutionSession", () => {
  it("loads an ARI once while retaining waiters from every island", () => {
    const session = new GraphResolutionSession(createInput(), {
      expand: () => ({ resources: [] }),
    });

    const fromPage = { resource: asset, inheritedIslandId: page.toString() };
    const fromMenu = { resource: asset, inheritedIslandId: menu.toString() };
    const fromFooter = { resource: asset, inheritedIslandId: footer.toString() };

    expect(session.rememberWaiter(fromPage)).toBe(true);
    expect(session.isQueued(asset)).toBe(true);
    expect(session.rememberWaiter(fromMenu)).toBe(false);
    expect(session.isQueued(asset)).toBe(true);

    session.markInFlight(asset);
    expect(session.isQueued(asset)).toBe(false);
    expect(session.isInFlight(asset)).toBe(true);
    expect(session.rememberWaiter(fromFooter)).toBe(false);
    expect(session.isInFlight(asset)).toBe(true);

    expect(new Set(session.inheritedIslandIdsFor(asset))).toEqual(
      new Set([page.toString(), menu.toString(), footer.toString()])
    );

    const waiters = session.settle(asset);
    expect(new Set(waiters)).toEqual(
      new Set([page.toString(), menu.toString(), footer.toString()])
    );
    expect(session.isPending(asset)).toBe(false);
  });

  it("expands a resolved payload once per waiting island context", () => {
    const expand = vi.fn(() => ({ resources: [] }));

    const session = new GraphResolutionSession(createInput(), { expand });
    session.commitRecords([{ resource: asset, payload: { url: "/logo.svg" } }]);

    session.expand({ resource: asset, inheritedIslandId: page.toString() });
    session.expand({ resource: asset, inheritedIslandId: menu.toString() });
    session.expand({ resource: asset, inheritedIslandId: footer.toString() });

    expect(expand).toHaveBeenCalledTimes(3);
    expect(session.islands.has(page.toString(), asset)).toBe(true);
    expect(session.islands.has(menu.toString(), asset)).toBe(true);
    expect(session.islands.has(footer.toString(), asset)).toBe(true);
  });

  it("aggregates missing-resource islands and skips a second load", () => {
    const session = new GraphResolutionSession(createInput(), {
      expand: () => ({ resources: [] }),
    });

    session.rememberWaiter({ resource: asset, inheritedIslandId: menu.toString() });
    session.registerMissing({ resource: asset, inheritedIslandId: menu.toString() });

    expect(session.rememberWaiter({ resource: asset, inheritedIslandId: footer.toString() })).toBe(
      false
    );
    expect(session.isPending(asset)).toBe(false);

    const output = session.toOutput();
    expect(output.errors).toEqual([
      {
        resourceKey: asset.toString(),
        message: `Unable to resolve ${asset.toString()}`,
        inheritedIslandIds: [footer.toString(), menu.toString()].sort(),
      },
    ]);
  });

  it("promotes backing hits into ContentMap without leaving the key pending", () => {
    const backingResources = new Map<string, unknown>([[asset.toString(), { url: "/cached.svg" }]]);
    const session = new GraphResolutionSession(createInput({ backingResources }), {
      expand: () => ({ resources: [] }),
    });

    session.rememberWaiter({ resource: asset, inheritedIslandId: page.toString() });
    session.promoteBackingHits([{ resource: asset, inheritedIslandId: page.toString() }]);

    expect(session.contentMap.get(asset)).toEqual({ url: "/cached.svg" });
    expect(backingResources.size).toBe(0);
    expect(session.isPending(asset)).toBe(false);
    expect(session.isUnresolved(asset)).toBe(false);
  });
});
