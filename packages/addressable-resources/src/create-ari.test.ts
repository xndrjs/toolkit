import { describe, expect, expectTypeOf, it } from "vitest";

import { createAri } from "./create-ari";

describe("createAri", () => {
  it("preserves the literal type of type", () => {
    const resource = createAri("task-permissions", { taskId: "task-123" });

    expectTypeOf(resource.type).toEqualTypeOf<"task-permissions">();
  });

  it("preserves the object type of key", () => {
    const resource = createAri("task-permissions", {
      taskId: "task-123",
      userId: "user-456",
    });

    expectTypeOf(resource.key).toEqualTypeOf<{
      readonly taskId: "task-123";
      readonly userId: "user-456";
    }>();
  });

  it("returns [type, key] from toArray()", () => {
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

  it("uses Type(field=value) serialization in toString()", () => {
    const resource = createAri("task-permissions", {
      taskId: "task-123",
      userId: "user-456",
    });

    expect(resource.toString()).toBe('task-permissions(taskId="task-123",userId="user-456")');
  });

  it("produces the same string when object keys are in different order", () => {
    const left = createAri("task-permissions", { b: 2, a: 1 });
    const right = createAri("task-permissions", { a: 1, b: 2 });

    expect(left.toString()).toBe(right.toString());
    expect(left.toString()).toBe("task-permissions(a=1,b=2)");
  });

  it("distinguishes string and number scalars in identity", () => {
    const asString = createAri("Thing", { id: "42" });
    const asNumber = createAri("Thing", { id: 42 });

    expect(asString.toString()).toBe('Thing(id="42")');
    expect(asNumber.toString()).toBe("Thing(id=42)");
    expect(asString.equals(asNumber)).toBe(false);
  });

  it("formats empty object keys as Type()", () => {
    const resource = createAri("tasks", {});

    expect(resource.toString()).toBe("tasks()");
    expect(resource.key).toEqual({});
    expect(resource.toArray()).toEqual(["tasks", {}]);
  });

  it("compares equivalent resources with equals()", () => {
    const left = createAri("task-permissions", { taskId: "task-123", userId: null });
    const right = createAri("task-permissions", { userId: null, taskId: "task-123" });
    const different = createAri("task-permissions", { taskId: "task-999", userId: null });

    expect(left.equals(right)).toBe(true);
    expect(left.equals(different)).toBe(false);
  });

  it("clones the key so caller mutations do not affect the resource", () => {
    const key = { taskId: "task-123", userId: "user-456" as string | null };

    const resource = createAri("task-permissions", key);

    key.taskId = "mutated";
    key.userId = "mutated";

    expect(resource.key).toEqual({ taskId: "task-123", userId: "user-456" });
    expect(resource.key).not.toBe(key);
    expect(Object.isFrozen(key)).toBe(false);
  });

  it("freezes the stored key object", () => {
    const resource = createAri("task-permissions", { taskId: "task-123" });

    expect(Object.isFrozen(resource.key)).toBe(true);

    expect(() => {
      (resource.key as { taskId: string }).taskId = "mutated";
    }).toThrow(TypeError);
  });
});
