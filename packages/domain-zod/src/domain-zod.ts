import { brandedField } from "./branded-field";
import { fromZod } from "./from-zod";
import { primitiveFromZod, shapeFromZod } from "./zod-kit";

/**
 * Zod-first entry points: `shape` / `primitive` attach `zodSchema`; `field` is {@link brandedField}.
 */
export const domainZod = {
  brandedField,
  field: brandedField,
  fromZod,
  primitive: primitiveFromZod,
  primitiveFromZod,
  shape: shapeFromZod,
  shapeFromZod,
};
