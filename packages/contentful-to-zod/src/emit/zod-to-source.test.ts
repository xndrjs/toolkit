import { describe, expect, it } from "vitest";
import { z } from "zod";

import { zodToSource } from "./zod-to-source";

describe("zodToSource", () => {
  it("serializes primitives and collections", () => {
    expect(zodToSource(z.string().min(1).max(256))).toBe("z.string().min(1).max(256)");
    expect(zodToSource(z.number().int().min(0))).toBe("z.number().int().min(0)");
    expect(zodToSource(z.boolean())).toBe("z.boolean()");
    expect(zodToSource(z.array(z.string()))).toBe("z.array(z.string())");
    expect(zodToSource(z.record(z.string(), z.unknown()))).toBe(
      "z.record(z.string(), z.unknown())"
    );
  });

  it("serializes object overrides with nested optional fields", () => {
    const schema = z.object({
      seoTitle: z.string(),
      noIndex: z.boolean().optional(),
    });

    expect(zodToSource(schema)).toBe(
      'z.object({ "seoTitle": z.string(), "noIndex": z.boolean().optional() })'
    );
  });

  it("serializes optional wrappers", () => {
    expect(zodToSource(z.string().optional())).toBe("z.string().optional()");
  });

  it("serializes enums and unions", () => {
    expect(zodToSource(z.enum(["draft", "published"]))).toBe('z.enum(["draft", "published"])');
    expect(zodToSource(z.union([z.literal(1), z.literal(2)]))).toBe(
      "z.union([z.literal(1), z.literal(2)])"
    );
  });
});
