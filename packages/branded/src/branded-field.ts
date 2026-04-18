import { z } from "zod";

export function defineBrandedField<Schema extends z.ZodType, Value>(kit: {
  schema: Schema;
  create: (input: z.input<Schema>) => Value;
}) {
  return kit.schema.transform((raw) => kit.create(raw as z.input<Schema>));
}
