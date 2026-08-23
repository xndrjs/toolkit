import { describe, expect, expectTypeOf, it } from "vitest";

import { createAri } from "./create-ari";

describe("createAri", () => {
  it("preserves the literal type of type", () => {
    const resource = createAri("task-permissions", { taskId: "task-123" });

    expectTypeOf(resource.type).toEqualTypeOf<"task-permissions">();
  });

  it("preserves the tuple type of key", () => {
    const resource = createAri("task-permissions", {
      taskId: "task-123",
      userId: "user-456",
    });

    expectTypeOf(resource.key[0]).toEqualTypeOf<{
      readonly taskId: "task-123";
      readonly userId: "user-456";
    }>();
  });

  it("returns [type, ...key] from toArray()", () => {
    const resource = createAri("task-permissions", {
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

  it("uses stable serialization in toString()", () => {
    const resource = createAri("task-permissions", {
      taskId: "task-123",
      userId: "user-456",
    });

    expect(resource.toString()).toBe(
      '"task-permissions":[{"taskId":"task-123","userId":"user-456"}]'
    );
  });

  it("produces the same string when object keys are in different order", () => {
    const left = createAri("task-permissions", { b: 2, a: 1 });
    const right = createAri("task-permissions", { a: 1, b: 2 });

    expect(left.toString()).toBe(right.toString());
    expect(left.toString()).toBe('"task-permissions":[{"a":1,"b":2}]');
  });

  it("compares equivalent resources with equals()", () => {
    const left = createAri("task-permissions", { taskId: "task-123", userId: null });
    const right = createAri("task-permissions", { userId: null, taskId: "task-123" });
    const different = createAri("task-permissions", { taskId: "task-999", userId: null });

    expect(left.equals(right)).toBe(true);
    expect(left.equals(different)).toBe(false);
  });

  it("clones the key so caller mutations do not affect the resource", () => {
    const keyPart = { taskId: "task-123", userId: "user-456" as string | null };

    const resource = createAri("task-permissions", keyPart);

    keyPart.taskId = "mutated";
    keyPart.userId = "mutated";

    expect(resource.key[0]).toEqual({ taskId: "task-123", userId: "user-456" });
    expect(resource.key[0]).not.toBe(keyPart);
    expect(Object.isFrozen(keyPart)).toBe(false);
  });

  it("accepts multiple key parts as rest arguments", () => {
    const resource = createAri("task-permissions", { taskId: "task-123" }, "scope");

    expect(resource.key).toEqual([{ taskId: "task-123" }, "scope"]);
    expect(resource.toArray()).toEqual(["task-permissions", { taskId: "task-123" }, "scope"]);
  });

  it("accepts an empty key via no rest arguments", () => {
    const resource = createAri("tasks");

    expect(resource.key).toEqual([]);
    expect(resource.toArray()).toEqual(["tasks"]);
  });

  it("freezes the stored key array and object parts", () => {
    const resource = createAri("task-permissions", { taskId: "task-123" }, "scope");

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
