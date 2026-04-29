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

export interface Validator<Input, Output> {
  readonly engine: string;
  validate(input: Input): ValidationResult<Output>;
}
