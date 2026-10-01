import { z } from "zod";

/** Parse with a clear loader-boundary error (Zod issues in the message). */
export function parsePayload<T>(schema: z.ZodType<T>, raw: unknown, label: string): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid ${label} payload from store: ${result.error.message}`);
  }
  return result.data;
}
