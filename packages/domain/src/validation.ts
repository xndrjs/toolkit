export type ValidationIssue = Readonly<{
  code: string;
  path: readonly (string | number)[];
  message: string;
  meta?: unknown;
}>;

export type ValidationFailure = Readonly<{
  engine: string;
  issues: readonly ValidationIssue[];
  raw?: unknown;
}>;

export type ValidationResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: ValidationFailure };

/**
 * `Input` documents what shape/primitive kit `create` / `safeCreate` accept (ergonomics only);
 * it is **not** trusted inside `validate`. Implementations must narrow from `unknown`.
 */
export interface Validator<_Input, Output = _Input> {
  readonly engine: string;
  validate(input: unknown): ValidationResult<Output>;
}
