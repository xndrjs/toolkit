import * as v from "valibot";

import type { BenchmarkAdapter, BenchmarkFailure, BenchmarkIssue } from "./contract";

function normalizeValibotPath(path: unknown): readonly (string | number)[] {
  if (!Array.isArray(path)) {
    return [];
  }

  return path
    .map((segment) => {
      if (typeof segment === "string" || typeof segment === "number") {
        return segment;
      }
      if (typeof segment === "symbol") {
        return String(segment);
      }
      if (typeof segment === "object" && segment !== null && "key" in segment) {
        const key = (segment as { key?: unknown }).key;
        if (typeof key === "string" || typeof key === "number") {
          return key;
        }
        if (typeof key === "symbol") {
          return String(key);
        }
      }
      return undefined;
    })
    .filter((segment): segment is string | number => segment !== undefined);
}

function valibotIssuesToFailure(
  issues: readonly v.BaseIssue<unknown>[] | undefined
): BenchmarkFailure {
  const mapped: BenchmarkIssue[] = (issues ?? []).map((issue) => ({
    code: String(issue.type ?? "valibot_issue"),
    path: normalizeValibotPath(issue.path),
    message: issue.message,
    meta: issue,
  }));

  return {
    engine: "valibot",
    issues: mapped,
    raw: issues,
  };
}

export const valibotAdapter: BenchmarkAdapter<v.GenericSchema> = {
  engine: "valibot",
  profile: {
    strictObjectKeys: false,
    collectsAllIssues: true,
    supportsTransform: true,
    coercesInput: false,
  },
  createValidator(schema) {
    return {
      validate(input) {
        const parsed = v.safeParse(schema, input);
        if (parsed.success) {
          return { success: true, data: parsed.output };
        }
        return { success: false, error: valibotIssuesToFailure(parsed.issues) };
      },
    };
  },
};
