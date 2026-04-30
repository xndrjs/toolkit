import type {
  ValidationFailure,
  ValidationIssue,
  ValidationResult,
  Validator,
} from "@xndrjs/domain";
import * as v from "valibot";

function normalizeIssuePath(path: unknown): readonly (string | number)[] {
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
    .filter((part): part is string | number => part !== undefined);
}

function valibotIssuesToFailure(
  issues: readonly v.BaseIssue<unknown>[] | undefined
): ValidationFailure {
  const mapped: ValidationIssue[] = (issues ?? []).map((issue) => ({
    code: String(issue.type ?? "valibot_issue"),
    path: normalizeIssuePath(issue.path),
    message: issue.message,
    meta: issue,
  }));

  return {
    engine: "valibot",
    issues: mapped,
    raw: issues,
  };
}

/**
 * Wraps a Valibot schema as a `Validator<Input, Output>` for `@xndrjs/domain`.
 * `Input` is the accepted type for kit `create` / `safeCreate`; `validate` always receives `unknown`.
 */
export function valibotToValidator<Schema extends v.GenericSchema>(
  schema: Schema
): Validator<v.InferInput<Schema>, v.InferOutput<Schema>> {
  return {
    engine: "valibot",
    validate(input: unknown): ValidationResult<v.InferOutput<Schema>> {
      const parsed = v.safeParse(schema, input);
      if (parsed.success) {
        return { success: true, data: parsed.output };
      }
      return { success: false, error: valibotIssuesToFailure(parsed.issues) };
    },
  };
}
