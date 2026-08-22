import { describe, expect, it } from "vitest";

import { buildResolvedResourceCacheFromIslands } from "./build-resolved-resource-cache";
import type { SerializedIsland } from "./types";

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

describe("buildResolvedResourceCacheFromIslands", () => {
  it("merges resources from complete islands only by default", () => {
    const cache = buildResolvedResourceCacheFromIslands([
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
    ]);

    expect([...cache.entries()]).toEqual([
      ["page:p", { title: "Home" }],
      ["hero:h", { name: "Hero" }],
      ["footer:f", { copy: "©" }],
      ["asset:a", { url: "/logo.png" }],
    ]);
  });

  it("includes partial islands when policy is all", () => {
    const cache = buildResolvedResourceCacheFromIslands(
      [
        island("page:p", "complete", {
          "page:p": { title: "Home" },
        }),
        island("menu:m", "partial", {
          "menu:m": { items: [] },
          "asset:a": { url: "/partial.png" },
        }),
      ],
      "all"
    );

    expect([...cache.entries()]).toEqual([
      ["page:p", { title: "Home" }],
      ["menu:m", { items: [] }],
      ["asset:a", { url: "/partial.png" }],
    ]);
  });

  it("uses last-write-wins for shared keys across included islands", () => {
    const cache = buildResolvedResourceCacheFromIslands([
      island("menu:m", "complete", {
        "asset:a": { url: "/menu.png" },
      }),
      island("footer:f", "complete", {
        "asset:a": { url: "/footer.png" },
      }),
    ]);

    expect(cache.get("asset:a")).toEqual({ url: "/footer.png" });
  });

  it("returns an empty map when no complete islands match only-complete", () => {
    const cache = buildResolvedResourceCacheFromIslands(
      [island("page:p", "partial", { "page:p": { title: "Home" } })],
      "only-complete"
    );

    expect(cache.size).toBe(0);
  });
});
