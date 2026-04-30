import { describe, expect, it } from "vitest";

import { arrayOf, objectFromFields, optional } from "./validation-compose";
import type { Validator } from "./validation";

const nonEmptyString: Validator<unknown, string> = {
  engine: "test",
  validate(input: unknown) {
    if (typeof input !== "string" || input.length === 0) {
      return {
        success: false,
        error: {
          engine: "test",
          issues: [{ code: "invalid_string", path: [], message: "Invalid string" }],
        },
      };
    }
    return { success: true, data: input };
  },
};

const nonNegativeInt: Validator<unknown, number> = {
  engine: "test",
  validate(input: unknown) {
    if (typeof input !== "number" || !Number.isInteger(input) || input < 0) {
      return {
        success: false,
        error: {
          engine: "test",
          issues: [{ code: "invalid_int", path: [], message: "Invalid int" }],
        },
      };
    }
    return { success: true, data: input };
  },
};

describe("validation-compose", () => {
  it("objectFromFields composes nested validators and prefixes paths", () => {
    const Address = objectFromFields({
      city: nonEmptyString,
      zip: nonNegativeInt,
    });

    const User = objectFromFields({
      name: nonEmptyString,
      age: nonNegativeInt,
      nickname: optional(nonEmptyString),
      address: Address,
      tags: arrayOf(nonEmptyString),
    });

    const ok = User.validate({
      name: "Ada",
      age: 33,
      address: { city: "Milan", zip: 20100 },
      tags: ["core", "validation"],
    });
    expect(ok.success).toBe(true);

    const fail = User.validate({
      name: "",
      age: -1,
      address: { city: "", zip: -5 },
      tags: ["ok", ""],
    });
    expect(fail.success).toBe(false);
    if (!fail.success) {
      expect(fail.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["name"] }),
          expect.objectContaining({ path: ["age"] }),
          expect.objectContaining({ path: ["address", "city"] }),
          expect.objectContaining({ path: ["address", "zip"] }),
          expect.objectContaining({ path: ["tags", 1] }),
        ])
      );
    }
  });

  it("arrayOf validates each element and supports custom engine", () => {
    const Numbers = arrayOf(nonNegativeInt, "array-validation");

    const ok = Numbers.validate([0, 1, 2]);
    expect(ok.success).toBe(true);

    const fail = Numbers.validate([0, -1, 2]);
    expect(fail.success).toBe(false);
    if (!fail.success) {
      expect(fail.error.engine).toBe("array-validation");
      expect(fail.error.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: [1] })])
      );
    }
  });
});
