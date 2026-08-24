import { describe, expect, it } from "vitest";

import { buildBackingResourcesFromIslands } from "./build-backing-resources";
import type { SerializedIsland } from "../types";

function island(
  islandId: string,
  completeness: SerializedIsland["completeness"],
  resources: Record<string, unknown>
): SerializedIsland {
  return {
    schemaVersion: 1,
    islandId,
    completeness,
    missingResources: completeness === "partial" ? ["missing:x"] : [],
    dependencies: [],
    resources,
  };
}

describe("buildBackingResourcesFromIslands", () => {
  it("merges resources from complete islands only with only-complete policy", () => {
    const backingResources = buildBackingResourcesFromIslands(
      [
        island("page:p", "complete", {
          "page:p": { title: "Home" },
          "hero:h": { name: "Hero" },
        }),
        island("menu:m", "partial", {
          "menu:m": { items: [] },
          "asset:a": { url: "/partial.png" },
        }),
        island("footer:f", "complete", {
          "footer:f": { copy: "©" },
          "asset:a": { url: "/logo.png" },
        }),
      ],
      { policy: "only-complete", onResourceConflict: () => null }
    );

    expect([...backingResources.entries()]).toEqual([
      ["page:p", { title: "Home" }],
      ["hero:h", { name: "Hero" }],
      ["footer:f", { copy: "©" }],
      ["asset:a", { url: "/logo.png" }],
    ]);
  });

  it("includes partial islands when policy is all", () => {
    const backingResources = buildBackingResourcesFromIslands(
      [
        island("page:p", "complete", {
          "page:p": { title: "Home" },
        }),
        island("menu:m", "partial", {
          "menu:m": { items: [] },
          "asset:a": { url: "/partial.png" },
        }),
      ],
      { policy: "all", onResourceConflict: () => null }
    );

    expect([...backingResources.entries()]).toEqual([
      ["page:p", { title: "Home" }],
      ["menu:m", { items: [] }],
      ["asset:a", { url: "/partial.png" }],
    ]);
  });

  it("calls onResourceConflict on key collision even when payloads are equal", () => {
    const conflictCalls: unknown[] = [];

    const backingResources = buildBackingResourcesFromIslands(
      [
        island("menu:m", "complete", {
          "asset:a": { url: "/same.png", w: 100 },
        }),
        island("footer:f", "complete", {
          // Deep-equal object, but different instance.
          "asset:a": { url: "/same.png", w: 100 },
        }),
      ],
      {
        policy: "all",
        onResourceConflict: (conflict) => {
          conflictCalls.push(conflict);
          return conflict.existing;
        },
      }
    );

    expect(conflictCalls).toHaveLength(1);
    expect(backingResources.get("asset:a")).toEqual({ url: "/same.png", w: 100 });
  });

  it("keeps existing when onResourceConflict returns conflict.existing", () => {
    const backingResources = buildBackingResourcesFromIslands(
      [
        island("menu:m", "complete", {
          "asset:a": { url: "/menu.png" },
        }),
        island("footer:f", "complete", {
          "asset:a": { url: "/footer.png" },
        }),
      ],
      {
        policy: "all",
        onResourceConflict: (conflict) => conflict.existing,
      }
    );

    expect(backingResources.get("asset:a")).toEqual({ url: "/menu.png" });
  });

  it("takes incoming when onResourceConflict returns conflict.incoming", () => {
    const backingResources = buildBackingResourcesFromIslands(
      [
        island("menu:m", "complete", {
          "asset:a": { url: "/menu.png" },
        }),
        island("footer:f", "complete", {
          "asset:a": { url: "/footer.png" },
        }),
      ],
      {
        policy: "all",
        onResourceConflict: (conflict) => conflict.incoming,
      }
    );

    expect(backingResources.get("asset:a")).toEqual({ url: "/footer.png" });
  });

  it("omits conflicting keys when onResourceConflict returns null", () => {
    const backingResources = buildBackingResourcesFromIslands(
      [
        island("menu:m", "complete", {
          "asset:a": { url: "/menu.png" },
        }),
        island("footer:f", "complete", {
          "asset:a": { url: "/footer.png" },
        }),
      ],
      {
        policy: "all",
        onResourceConflict: () => null,
      }
    );

    expect(backingResources.has("asset:a")).toBe(false);
  });

  it("propagates errors thrown by onResourceConflict", () => {
    expect(() =>
      buildBackingResourcesFromIslands(
        [
          island("menu:m", "complete", {
            "asset:a": { url: "/menu.png" },
          }),
          island("footer:f", "complete", {
            "asset:a": { url: "/footer.png" },
          }),
        ],
        {
          policy: "all",
          onResourceConflict: () => {
            throw new Error("conflict");
          },
        }
      )
    ).toThrowError("conflict");
  });

  it("returns an empty map when no complete islands match only-complete", () => {
    const backingResources = buildBackingResourcesFromIslands(
      [island("page:p", "partial", { "page:p": { title: "Home" } })],
      { policy: "only-complete", onResourceConflict: () => null }
    );

    expect(backingResources.size).toBe(0);
  });
});
