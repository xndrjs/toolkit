import { z } from "zod";
import { BrandedValidationError } from "./errors";
import { BrandedPrimitive } from "./types";

/**
 * Branded **scalar** validated with Zod. Nominal distinction exists only in TypeScript;
 * runtime values are plain primitives (no `__brand` attachment).
 */
export function defineBrandedPrimitive<
  Schema extends z.ZodType,
  Type extends string,
  Value extends BrandedPrimitive<Type, z.infer<Schema>>,
>(type: Type, schema: Schema) {
  return {
    create: (input: z.infer<Schema>): Value => {
      const parsed = schema.safeParse(input);
      if (!parsed.success) {
        throw new BrandedValidationError(
          `Invalid value for primitive brand "${type}"`,
          parsed.error
        );
      }
      return parsed.data as Value;
    },
    is: (value: unknown): value is Value => {
      return schema.safeParse(value).success;
    },
    schema,
    type,
  };
}
