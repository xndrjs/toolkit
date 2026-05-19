import { domain } from "@xndrjs/domain";

import { userBaselineValidator } from "../validators/user-baseline.js";

/** Proof uses a core validator; `refineType` adds the business guarantee on top. */
export const VerifiedUserProof = domain
  .proof("VerifiedUser", userBaselineValidator)
  .refineType((row): row is typeof row & { isVerified: true } => row.isVerified === true);
