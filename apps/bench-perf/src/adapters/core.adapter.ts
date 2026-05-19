import type { ValidationFailure, Validator } from "@xndrjs/domain";

import type { BenchmarkAdapter, BenchmarkFailure, BenchmarkIssue } from "./contract";

function toBenchmarkFailure(failure: ValidationFailure): BenchmarkFailure {
  const issues: BenchmarkIssue[] = failure.issues.map((issue) => ({
    code: issue.code,
    path: issue.path,
    message: issue.message,
    meta: issue.meta,
  }));

  return {
    engine: "core",
    issues,
    raw: failure.raw,
  };
}

export const coreAdapter: BenchmarkAdapter<Validator<unknown>> = {
  engine: "core",
  profile: {
    strictObjectKeys: false,
    collectsAllIssues: true,
    supportsTransform: true,
    coercesInput: false,
  },
  createValidator(schema) {
    return {
      validate(input) {
        const result = schema.validate(input);
        if (result.success) {
          return { success: true, data: result.data };
        }
        return { success: false, error: toBenchmarkFailure(result.error) };
      },
    };
  },
};
