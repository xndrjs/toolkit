import { describe, expect, it } from "vitest";

import { DomainValidationError } from "./errors";
import type { ValidationFailure } from "./validation";

describe("DomainValidationError", () => {
  it("stores code, message, failure, and optional cause", () => {
    const failure: ValidationFailure = {
      engine: "test",
      issues: [{ code: "E1", path: ["a"], message: "bad" }],
    };
    const cause = new Error("root");
    const error = new DomainValidationError("Validation failed", failure, { cause });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("DomainValidationError");
    expect(error.code).toBe("DOMAIN_VALIDATION_ERROR");
    expect(error.message).toBe("Validation failed");
    expect(error.failure).toBe(failure);
    expect(error.issues).toBe(failure.issues);
    expect(error.cause).toBe(cause);
  });

  it("issues getter mirrors failure.issues", () => {
    const failure: ValidationFailure = {
      engine: "x",
      issues: [
        { code: "c", path: [], message: "m1" },
        { code: "d", path: [0, "x"], message: "m2" },
      ],
    };
    const error = new DomainValidationError("x", failure);
    expect(error.issues.length).toBe(2);
    expect(error.issues[0]?.message).toBe("m1");
  });
});
