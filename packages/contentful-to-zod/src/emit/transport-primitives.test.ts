import { describe, expect, it } from "vitest";
import { z } from "zod";

import { wrapAbsentToNullField } from "./transport-primitives";

describe("wrapAbsentToNullField", () => {
  const schema = wrapAbsentToNullField(z.string());

  it("accepts present values", () => {
    expect(schema.parse("hello")).toBe("hello");
  });

  it("accepts explicit null", () => {
    expect(schema.parse(null)).toBeNull();
  });

  it("accepts omitted keys via undefined and normalizes to null", () => {
    expect(schema.parse(undefined)).toBeNull();
  });
});
