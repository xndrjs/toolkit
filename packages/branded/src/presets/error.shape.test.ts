import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ErrorShape, baseErrorSchema } from "./error.shape";

describe("error presets", () => {
  it("defaults kind to Error", () => {
    const parsed = baseErrorSchema.safeParse({ code: "E_TEST", message: "hello" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.kind).toBe("Error");
      expect(parsed.data.code).toBe("E_TEST");
      expect(parsed.data.message).toBe("hello");
    }
  });

  it("creates and patches ErrorShape", () => {
    const e = ErrorShape.create({ code: "E_TEST", message: "hello" });
    expect(e.kind).toBe("Error");
    expect(e.code).toBe("E_TEST");
    expect(ErrorShape.is(e)).toBe(true);
  });

  it("supports extension from ErrorShape", () => {
    const [UserNotFoundShape] = ErrorShape.extend("UserNotFound", (baseSchema) => ({
      schema: baseSchema.extend({
        metadata: z.object({ id: z.string() }),
      }),
    }));
    const e = UserNotFoundShape.create({
      code: "USER_NOT_FOUND",
      message: "Unknown user",
      metadata: { id: "u-1" },
    });
    expect(e.metadata.id).toBe("u-1");
  });
});
