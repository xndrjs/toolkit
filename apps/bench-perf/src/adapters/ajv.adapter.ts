import { jsonSchemaToValidator } from "@xndrjs/domain-ajv";

import type { BenchmarkAdapter, BenchmarkFailure, BenchmarkIssue } from "./contract";

function toBenchmarkFailure(error: {
  issues: readonly {
    code: string;
    path: readonly (string | number)[];
    message: string;
    meta?: unknown;
  }[];
  raw?: unknown;
}): BenchmarkFailure {
  const issues: BenchmarkIssue[] = error.issues.map((issue) => ({
    code: issue.code,
    path: issue.path,
    message: issue.message,
    meta: issue.meta,
  }));

  return {
    engine: "ajv",
    issues,
    raw: error.raw,
  };
}

export const ajvAdapter: BenchmarkAdapter<object> = {
  engine: "ajv",
  profile: {
    strictObjectKeys: false,
    collectsAllIssues: true,
    supportsTransform: false,
    coercesInput: false,
  },
  createValidator(schema) {
    const validator = jsonSchemaToValidator(schema);
    return {
      validate(input) {
        const result = validator.validate(input);
        if (result.success) {
          return result;
        }
        return {
          success: false,
          error: toBenchmarkFailure(result.error),
        };
      },
    };
  },
};
