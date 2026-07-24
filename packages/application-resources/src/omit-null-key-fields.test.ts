import { describe, expect, expectTypeOf, it } from "vitest";

import { ari } from "./ari";
import { omitNullKeyFields } from "./omit-null-key-fields";

describe("omitNullKeyFields", () => {
  it("removes null fields from object key parts in a toArray() projection", () => {
    const resource = ari("task-permissions", [
      {
        taskId: "task-123",
        userId: null,
      },
    ] as const);

    const projected = omitNullKeyFields(resource.toArray());

    expect(projected).toEqual(["task-permissions", { taskId: "task-123" }]);
    expectTypeOf(projected).toEqualTypeOf<
      readonly [
        "task-permissions",
        {
          readonly taskId: "task-123";
        },
      ]
    >();
  });

  it("leaves non-null object fields and primitive key parts unchanged", () => {
    const resource = ari("task-permissions", [
      "scope",
      {
        taskId: "task-123",
        userId: "user-456",
        archived: false,
      },
    ] as const);

    expect(omitNullKeyFields(resource.toArray())).toEqual([
      "task-permissions",
      "scope",
      {
        taskId: "task-123",
        userId: "user-456",
        archived: false,
      },
    ]);
  });

  it("does not mutate the original toArray() projection", () => {
    const resource = ari("task-permissions", [
      {
        taskId: "task-123",
        userId: null,
      },
    ] as const);
    const original = resource.toArray();

    const projected = omitNullKeyFields(original);

    expect(original).toEqual(["task-permissions", { taskId: "task-123", userId: null }]);
    expect(projected).not.toBe(original);
    expect(projected[1]).not.toBe(original[1]);
  });
});
