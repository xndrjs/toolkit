import { describe, expect, expectTypeOf, it } from "vitest";

import { ari } from "./ari";

describe("ari", () => {
  it("preserves the literal type of type", () => {
    const resource = ari("task-permissions", { taskId: "task-123" });

    expectTypeOf(resource.type).toEqualTypeOf<"task-permissions">();
  });

  it("preserves the tuple type of key", () => {
    const resource = ari("task-permissions", {
      taskId: "task-123",
      userId: "user-456",
    });

    expectTypeOf(resource.key[0]).toEqualTypeOf<{
      readonly taskId: "task-123";
      readonly userId: "user-456";
    }>();
    expectTypeOf(resource.key).toEqualTypeOf<
      readonly [
        {
          readonly taskId: "task-123";
          readonly userId: "user-456";
        },
      ]
    >();
  });

  describe("resource factory", () => {
    function taskPermissionsResource(params: { taskId: string; userId?: string }) {
      return ari("task-permissions", {
        taskId: params.taskId,
        userId: params.userId ?? null,
      });
    }

    it("builds a valid resource from factory parameters", () => {
      const resource = taskPermissionsResource({
        taskId: "task-123",
        userId: "user-456",
      });

      expectTypeOf(resource.type).toEqualTypeOf<"task-permissions">();
      expectTypeOf(resource.key[0]).toEqualTypeOf<{
        readonly taskId: string;
        readonly userId: string | null;
      }>();

      expect(resource.type).toBe("task-permissions");
      expect(resource.key).toEqual([{ taskId: "task-123", userId: "user-456" }]);
      expect(resource.toArray()).toEqual([
        "task-permissions",
        { taskId: "task-123", userId: "user-456" },
      ]);
      expect(resource.format()).toBe(
        '"task-permissions":[{"taskId":"task-123","userId":"user-456"}]'
      );

      const sameScope = taskPermissionsResource({
        taskId: "task-123",
        userId: "user-456",
      });
      expect(resource.equals(sameScope)).toBe(true);
    });

    it("normalizes a missing userId to null", () => {
      const resource = taskPermissionsResource({ taskId: "task-123" });

      expect(resource.key).toEqual([{ taskId: "task-123", userId: null }]);
    });
  });

  it("returns [type, ...key] from toArray()", () => {
    const resource = ari("task-permissions", {
      taskId: "task-123",
      userId: "user-456",
    });

    expect(resource.toArray()).toEqual([
      "task-permissions",
      {
        taskId: "task-123",
        userId: "user-456",
      },
    ]);
  });

  it("uses stable serialization in format()", () => {
    const resource = ari("task-permissions", {
      taskId: "task-123",
      userId: "user-456",
    });

    expect(resource.format()).toBe(
      '"task-permissions":[{"taskId":"task-123","userId":"user-456"}]'
    );
  });

  it("produces the same format string when object keys are in different order", () => {
    const left = ari("task-permissions", { b: 2, a: 1 });
    const right = ari("task-permissions", { a: 1, b: 2 });

    expect(left.format()).toBe(right.format());
    expect(left.format()).toBe('"task-permissions":[{"a":1,"b":2}]');
  });

  it("compares equivalent resources with equals()", () => {
    const left = ari("task-permissions", { taskId: "task-123", userId: null });
    const right = ari("task-permissions", { userId: null, taskId: "task-123" });
    const different = ari("task-permissions", { taskId: "task-999", userId: null });

    expect(left.equals(right)).toBe(true);
    expect(left.equals(different)).toBe(false);
  });

  it("uses a custom formatter when provided", () => {
    const resource = ari("task-permissions", { taskId: "task-123" });

    expect(resource.format((value) => `${value.type}:${value.key.length}`)).toBe(
      "task-permissions:1"
    );
  });

  it("clones the key so caller mutations do not affect the resource", () => {
    const keyPart = { taskId: "task-123", userId: "user-456" as string | null };

    const resource = ari("task-permissions", keyPart);

    keyPart.taskId = "mutated";
    keyPart.userId = "mutated";

    expect(resource.key[0]).toEqual({ taskId: "task-123", userId: "user-456" });
    expect(resource.key[0]).not.toBe(keyPart);
    expect(Object.isFrozen(keyPart)).toBe(false);
  });

  it("accepts multiple key parts as rest arguments", () => {
    const resource = ari("task-permissions", { taskId: "task-123" }, "scope");

    expect(resource.key).toEqual([{ taskId: "task-123" }, "scope"]);
    expect(resource.toArray()).toEqual(["task-permissions", { taskId: "task-123" }, "scope"]);
  });

  it("accepts an empty key via no rest arguments", () => {
    const resource = ari("tasks");

    expect(resource.key).toEqual([]);
    expect(resource.toArray()).toEqual(["tasks"]);
  });

  it("freezes the stored key array and object parts", () => {
    const resource = ari("task-permissions", { taskId: "task-123" }, "scope");

    expect(Object.isFrozen(resource.key)).toBe(true);
    expect(Object.isFrozen(resource.key[0])).toBe(true);

    expect(() => {
      (resource.key[0] as { taskId: string }).taskId = "mutated";
    }).toThrow(TypeError);

    expect(() => {
      (resource.key as unknown as string[]).push("extra");
    }).toThrow(TypeError);
  });
});
