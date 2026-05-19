import { domain, valibotFromKit, valibotToValidator } from "@xndrjs/domain-valibot";
import * as v from "valibot";

import { EmailPrimitive } from "../primitives/email.primitive.js";

/**
 * User aggregate validated with Valibot; nested email reuses the Zod-backed `EmailPrimitive`
 * via `valibotFromKit` (same pattern as composing kits in a parent schema).
 */
export const UserShape = domain.shape(
  "User",
  valibotToValidator(
    v.object({
      type: v.optional(v.literal("User"), "User"),
      email: valibotFromKit(EmailPrimitive),
      displayName: v.pipe(v.string(), v.minLength(1)),
      isVerified: v.boolean(),
    })
  )
);
