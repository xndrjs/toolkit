import type { z } from "zod";

import type { BenchmarkAdapter, BenchmarkFailure, BenchmarkIssue } from "./contract";
import { normalizePath } from "./contract";

function zodErrorToFailure(zodError: z.ZodError): BenchmarkFailure {
  const issues: BenchmarkIssue[] = zodError.issues.map((issue) => ({
    code: String(issue.code),
    path: normalizePath(issue.path),
    message: issue.message,
    meta: issue,
  }));

  return {
    engine: "zod",
    issues,
    raw: zodError,
  };
}

export const zodAdapter: BenchmarkAdapter<z.ZodTypeAny> = {
  engine: "zod",
  profile: {
    strictObjectKeys: false,
    collectsAllIssues: true,
    supportsTransform: true,
    coercesInput: false,
  },
  createValidator(schema) {
    return {
      validate(input) {
        const parsed = schema.safeParse(input);
        if (parsed.success) {
          return { success: true, data: parsed.data };
        }
        return { success: false, error: zodErrorToFailure(parsed.error) };
      },
    };
  },
};
