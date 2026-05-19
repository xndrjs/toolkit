import type { Validator } from "@xndrjs/domain";

function issue(code: string, message: string) {
  return { code, path: [] as const, message };
}

export function nonEmptyStringValidator(): Validator<string> {
  return {
    engine: "interop-core",
    validate(input) {
      if (typeof input !== "string" || input.length === 0) {
        return {
          success: false,
          error: {
            engine: "interop-core",
            issues: [issue("invalid_string", "Expected non-empty string")],
          },
        };
      }
      return { success: true, data: input };
    },
  };
}

export function booleanValidator(): Validator<boolean> {
  return {
    engine: "interop-core",
    validate(input) {
      if (typeof input !== "boolean") {
        return {
          success: false,
          error: {
            engine: "interop-core",
            issues: [issue("invalid_type", "Expected boolean")],
          },
        };
      }
      return { success: true, data: input };
    },
  };
}

export function typeFieldValidator<const T extends string>(expected: T): Validator<unknown, T> {
  return {
    engine: "interop-core",
    validate(input) {
      const resolved = typeof input === "string" ? input : expected;
      if (resolved !== expected) {
        return {
          success: false,
          error: {
            engine: "interop-core",
            issues: [issue("invalid_type", `Expected type ${expected}`)],
          },
        };
      }
      return { success: true, data: expected };
    },
  };
}
