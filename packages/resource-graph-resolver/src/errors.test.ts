import { describe, expect, it } from "vitest";

import { ResolutionError, toResolutionErrorData } from "./errors";

describe("toResolutionErrorData", () => {
  it("creates a JSON-safe value without exception internals", () => {
    const originalError = new Error("upstream details");
    const error = new ResolutionError(503, "Service unavailable", originalError, {
      resourceKey: 'Entry:[{"id":"home"}]',
      inheritedIslandIds: ["page", "navigation"],
    });

    const projected = toResolutionErrorData(error);

    expect(projected).toEqual({
      kind: "ResolutionError",
      code: 503,
      message: "Service unavailable",
      resourceKey: 'Entry:[{"id":"home"}]',
      inheritedIslandIds: ["page", "navigation"],
    });
    expect(projected).not.toBeInstanceOf(Error);
    expect(projected).not.toHaveProperty("originalError");
    expect(projected).not.toHaveProperty("cause");
    expect(JSON.parse(JSON.stringify(projected))).toEqual(projected);
  });

  it("omits an absent resource key", () => {
    expect(toResolutionErrorData(new ResolutionError("missing", "Missing"))).toEqual({
      kind: "ResolutionError",
      code: "missing",
      message: "Missing",
      inheritedIslandIds: [],
    });
  });
});
