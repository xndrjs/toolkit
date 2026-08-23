import { describe, expect, it } from "vitest";

import { createAri } from "./create-ari";
import {
  parseStableStringifyResource,
  safeParseStableStringifyResource,
} from "./parse-stable-stringify";
import { stableStringifyResource } from "./stable-stringify";

describe("parseStableStringifyResource", () => {
  it("round-trips createAri resources", () => {
    const cases = [
      createAri("task-permissions", { taskId: "task-123", userId: "user-456" }),
      createAri("task-permissions", { b: 2, a: 1 }),
      createAri("task-permissions", { taskId: "task-123", userId: null }),
      createAri("scoped", { id: "1" }, "v1"),
      createAri("tasks"),
      createAri("count", 42),
      createAri("flag", true),
      createAri("empty", null),
    ];

    for (const resource of cases) {
      const wire = resource.toString();
      expect(parseStableStringifyResource(wire)).toEqual({
        type: resource.type,
        key: resource.key,
      });
      expect(stableStringifyResource(resource.type, resource.key)).toBe(wire);
    }
  });

  it("splits type and key when the key JSON contains colons", () => {
    const wire = stableStringifyResource("page", [{ url: "http://example.com" }]);
    expect(parseStableStringifyResource(wire)).toEqual({
      type: "page",
      key: [{ url: "http://example.com" }],
    });
  });

  it("splits type and key when the type contains escaped quotes", () => {
    const wire = stableStringifyResource('foo"bar', []);
    expect(parseStableStringifyResource(wire)).toEqual({
      type: 'foo"bar',
      key: [],
    });
  });

  it("returns structured issues for malformed strings", () => {
    expect(parseStableStringifyResource("")).toBeNull();
    expect(parseStableStringifyResource("not-json")).toBeNull();

    const invalidKey = safeParseStableStringifyResource('"type":[[1]]');
    expect(invalidKey.success).toBe(false);
    if (!invalidKey.success) {
      expect(invalidKey.issues[0]?.path).toEqual([0]);
    }

    const nestedObject = safeParseStableStringifyResource('"type":[{"nested":{"id":"1"}}]');
    expect(nestedObject.success).toBe(false);
    if (!nestedObject.success) {
      expect(nestedObject.issues[0]?.path).toEqual([0, "nested"]);
    }
  });
});
