import type { ValidationIssue, ValidationResult, Validator } from "./validation";

export interface OptionalField<T> {
  readonly optional: true;
  readonly validator: Validator<unknown, T>;
}

export type FieldSpec<T> = Validator<unknown, T> | OptionalField<T>;

type FieldOutput<TSpec> =
  TSpec extends OptionalField<infer T>
    ? T | undefined
    : TSpec extends Validator<unknown, infer T>
      ? T
      : never;

export type ObjectOutput<TFields extends Record<string, FieldSpec<unknown>>> = {
  [K in keyof TFields]: FieldOutput<TFields[K]>;
};

function withPathPrefix(
  prefix: string | number,
  issues: readonly ValidationIssue[]
): readonly ValidationIssue[] {
  return issues.map((issue) => ({
    ...issue,
    path: [prefix, ...issue.path],
  }));
}

function asFieldSpec<T>(spec: FieldSpec<T>): OptionalField<T> | Validator<unknown, T> {
  return spec;
}

export function optional<T>(validator: Validator<unknown, T>): OptionalField<T> {
  return { optional: true, validator };
}

export function objectFromFields<TFields extends Record<string, FieldSpec<unknown>>>(
  fields: TFields,
  engine = "domain-compose"
): Validator<unknown, ObjectOutput<TFields>> {
  return {
    engine,
    validate(input: unknown): ValidationResult<ObjectOutput<TFields>> {
      if (typeof input !== "object" || input === null) {
        return {
          success: false,
          error: {
            engine,
            issues: [{ code: "invalid_type", path: [], message: "Expected object" }],
          },
        };
      }

      const row = input as Record<string, unknown>;
      const out = {} as ObjectOutput<TFields>;
      const issues: ValidationIssue[] = [];

      for (const key of Object.keys(fields) as (keyof TFields)[]) {
        const rawSpec = fields[key];
        if (!rawSpec) {
          continue;
        }
        const spec = asFieldSpec(rawSpec);
        const isOptional = typeof spec === "object" && "optional" in spec;
        const validator = isOptional ? spec.validator : spec;
        const value = row[key as string];

        if (value === undefined && isOptional) {
          out[key] = undefined as ObjectOutput<TFields>[typeof key];
          continue;
        }

        const result = validator.validate(value);
        if (!result.success) {
          issues.push(...withPathPrefix(key as string, result.error.issues));
          continue;
        }

        out[key] = result.data as ObjectOutput<TFields>[typeof key];
      }

      if (issues.length > 0) {
        return { success: false, error: { engine, issues } };
      }

      return { success: true, data: out };
    },
  };
}

export function arrayOf<T>(
  item: Validator<unknown, T>,
  engine = item.engine
): Validator<unknown, readonly T[]> {
  return {
    engine,
    validate(input: unknown): ValidationResult<readonly T[]> {
      if (!Array.isArray(input)) {
        return {
          success: false,
          error: {
            engine,
            issues: [{ code: "invalid_type", path: [], message: "Expected array" }],
          },
        };
      }

      const out: T[] = [];
      const issues: ValidationIssue[] = [];

      for (let index = 0; index < input.length; index += 1) {
        const result = item.validate(input[index]);
        if (!result.success) {
          issues.push(...withPathPrefix(index, result.error.issues));
          continue;
        }
        out.push(result.data);
      }

      if (issues.length > 0) {
        return { success: false, error: { engine, issues } };
      }

      return { success: true, data: out };
    },
  };
}
