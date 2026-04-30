import type {
  ValidationFailure,
  ValidationIssue,
  ValidationResult,
  Validator,
} from "@xndrjs/domain";
import type { z } from "zod";

function normalizeIssuePath(path: readonly PropertyKey[]): readonly (string | number)[] {
  return path.map((key) => (typeof key === "symbol" ? String(key) : key));
}

function zodErrorToFailure(zodError: z.ZodError): ValidationFailure {
  const issues: ValidationIssue[] = zodError.issues.map((issue) => ({
    code: String(issue.code),
    path: normalizeIssuePath(issue.path),
    message: issue.message,
    meta: issue,
  }));

  return {
    engine: "zod",
    issues,
    raw: zodError,
  };
}

/**
 * Wraps a Zod **4.x** schema as a `Validator<Input, Output>` for `@xndrjs/domain`.
 * `Input` is the accepted type for kit `create` / `safeCreate`; `validate` always receives `unknown`.
 * Failures map to `ValidationFailure` with `engine: "zod"` and per-issue `meta` set to the raw Zod issue.
 */
export function fromZod<Schema extends z.ZodTypeAny>(
  schema: Schema
): Validator<z.input<Schema>, z.output<Schema>> {
  return {
    engine: "zod",
    validate(input: unknown): ValidationResult<z.output<Schema>> {
      const parsed = schema.safeParse(input);
      if (parsed.success) {
        return { success: true, data: parsed.data };
      }
      return { success: false, error: zodErrorToFailure(parsed.error) };
    },
  };
}
