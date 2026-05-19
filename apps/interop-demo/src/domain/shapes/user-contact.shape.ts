import { compose, domain } from "@xndrjs/domain";

import { EmailPrimitive } from "../primitives/email.primitive.js";
import { nonEmptyStringValidator } from "../validators/common.js";

/** Slim contact view — core `compose` only, useful as a `project` target from `User`. */
export const UserContactShape = domain.shape(
  "UserContact",
  compose.object({
    email: EmailPrimitive.validator,
    displayName: nonEmptyStringValidator(),
  })
);
