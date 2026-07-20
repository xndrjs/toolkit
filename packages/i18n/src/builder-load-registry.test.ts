import { describe, expect, it } from "vitest";
import { BuilderLoadRegistry } from "./builder-load-registry.js";

describe("BuilderLoadRegistry", () => {
  it("tracks pending, loaded, and error states", () => {
    const registry = new BuilderLoadRegistry();
    const failure = new Error("boom");

    registry.markPending("billing", "it");
    expect(registry.getLoadState()).toEqual({
      resources: [{ namespace: "billing", partition: "it", status: "pending" }],
    });

    registry.markLoaded("billing", "it");
    expect(registry.has("billing", "it")).toBe(true);
    expect(registry.getLoadState()).toEqual({
      resources: [{ namespace: "billing", partition: "it", status: "loaded" }],
    });
    expect(registry.entries()).toEqual([["billing", "it"]]);

    registry.markError("default", "en", failure);
    expect(registry.getLoadState()).toEqual({
      resources: [
        { namespace: "billing", partition: "it", status: "loaded" },
        { namespace: "default", partition: "en", status: "error", error: failure },
      ],
    });
  });

  it("seeds hydrated resources as loaded", () => {
    const registry = new BuilderLoadRegistry();
    registry.seed([
      ["default", "it"],
      ["billing", "it"],
    ]);

    expect(registry.getLoadState()).toEqual({
      resources: [
        { namespace: "billing", partition: "it", status: "loaded" },
        { namespace: "default", partition: "it", status: "loaded" },
      ],
    });
  });
});
