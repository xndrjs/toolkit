import { z } from "zod";

import { defineBrandedShape } from "../branded-shape";

/**
 * Reusable base schema for domain/application errors.
 */
export const baseErrorSchema = z.object({
  kind: z.literal("Error").default("Error"),
  code: z.string(),
  message: z.string(),
});

/**
 * Default preset shape for generic errors.
 * Extend from this shape with `ErrorShape.extend(...)` to model specific errors.
 */
export const [ErrorShape] = defineBrandedShape("Error", baseErrorSchema, {
  methods: {},
});
