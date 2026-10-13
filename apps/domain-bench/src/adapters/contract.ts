export type BenchmarkEngine = "zod" | "valibot" | "ajv" | "core" | "raw";

export type BenchmarkMode = "valid" | "invalid";

export type BenchmarkIssue = Readonly<{
  code: string;
  path: readonly (string | number)[];
  message: string;
  meta?: unknown;
}>;

export type BenchmarkFailure = Readonly<{
  engine: BenchmarkEngine;
  issues: readonly BenchmarkIssue[];
  raw?: unknown;
}>;

export type BenchmarkValidationResult<TOutput> =
  | { readonly success: true; readonly data: TOutput }
  | { readonly success: false; readonly error: BenchmarkFailure };

export interface BenchmarkValidator<TOutput> {
  validate(input: unknown): BenchmarkValidationResult<TOutput>;
}

/**
 * Declares key semantic knobs to keep cross-engine benchmark runs comparable.
 */
export type AdapterSemanticProfile = Readonly<{
  strictObjectKeys: boolean;
  collectsAllIssues: boolean;
  supportsTransform: boolean;
  coercesInput: boolean;
}>;

export interface BenchmarkAdapter<TSchema, TOutput = unknown> {
  readonly engine: BenchmarkEngine;
  readonly profile: AdapterSemanticProfile;
  createValidator(schema: TSchema): BenchmarkValidator<TOutput>;
}

export function normalizePath(path: readonly PropertyKey[]): readonly (string | number)[] {
  return path.map((segment) => (typeof segment === "symbol" ? String(segment) : segment));
}
