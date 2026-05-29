import { z } from "zod";

/** Runtime wrapper matching generated field normalizers (used in tests). */
export function wrapAbsentToNullField(schema: z.ZodType): z.ZodType {
  return schema
    .nullable()
    .optional()
    .transform((value) => value ?? null);
}

/** @deprecated Use wrapAbsentToNullField */
export const wrapTransportField = wrapAbsentToNullField;

/** Emit shared `flatField` helper for flat/CMA field schemas. */
export function emitFlatFieldHelper(): string {
  return [
    "/**",
    " * Flat/CMA field wrapper: omitted keys and explicit null both normalize to `null`.",
    " * Use after `flatten*` or when parsing a normalized flat shape.",
    " */",
    "export function flatField<T extends z.ZodType>(schema: T) {",
    "  return schema.nullable().optional().transform((value) => value ?? null);",
    "}",
  ].join("\n");
}

/** Emit shared `transportField` helper for delivery/preview field schemas. */
export function emitTransportFieldHelper(): string {
  return [
    "/**",
    " * Delivery/Preview field wrapper: omitted keys and explicit null both normalize to `null`.",
    " * CMA `required` does not apply at the transport boundary.",
    " */",
    "export function transportField<T extends z.ZodType>(schema: T) {",
    "  return schema.nullable().optional().transform((value) => value ?? null);",
    "}",
  ].join("\n");
}
