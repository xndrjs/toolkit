import { z } from "zod";

export class BrandedError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "BrandedError";
    this.code = code;
  }
}

export class BrandedValidationError extends BrandedError {
  readonly zodError: z.ZodError;
  readonly issues: z.ZodError["issues"];

  constructor(message: string, zodError: z.ZodError) {
    super("BRANDED_VALIDATION_ERROR", message, { cause: zodError });
    this.name = "BrandedValidationError";
    this.zodError = zodError;
    this.issues = zodError.issues;
  }

  /** Field/form-shaped errors via `z.flattenError` (Zod 4; avoids deprecated `ZodError#flatten`). */
  flatten() {
    return z.flattenError(this.zodError);
  }

  /** Nested issue tree via `z.treeifyError` (Zod 4; avoids deprecated `ZodError#format`). */
  treeify() {
    return z.treeifyError(this.zodError);
  }
}
