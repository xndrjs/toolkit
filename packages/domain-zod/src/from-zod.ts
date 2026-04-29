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
 * Wraps a Zod schema as a {@link Validator} for `@xndrjs/domain`.
 */
export function fromZod<Schema extends z.ZodTypeAny>(
  schema: Schema
): Validator<z.input<Schema>, z.output<Schema>> {
  return {
    engine: "zod",
    validate(input: z.input<Schema>): ValidationResult<z.output<Schema>> {
      const parsed = schema.safeParse(input);
      if (parsed.success) {
        return { success: true, data: parsed.data };
      }
      return { success: false, error: zodErrorToFailure(parsed.error) };
    },
  };
}
