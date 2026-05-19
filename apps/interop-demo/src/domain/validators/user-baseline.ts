import { compose } from "@xndrjs/domain";

import { booleanValidator, nonEmptyStringValidator, typeFieldValidator } from "./common.js";

/**
 * Core validator for proof input — same row shape as `User`, without pulling in Valibot/Zod.
 */
export const userBaselineValidator = compose.object({
  type: typeFieldValidator("User"),
  email: nonEmptyStringValidator(),
  displayName: nonEmptyStringValidator(),
  isVerified: booleanValidator(),
});
