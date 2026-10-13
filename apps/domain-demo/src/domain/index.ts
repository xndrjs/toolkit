/**
 * Workshop checkout domain — validators are mixed on purpose:
 *
 * - Zod: `EmailPrimitive`, `ProfileShape`
 * - Valibot: `UserShape` (with `valibotFromKit(EmailPrimitive)`)
 * - Core: `MoneyPrimitive`, `UserContactShape`, `VerifiedUserProof`
 */
export type { ProfileRow, UserContactRow, UserRow } from "./types.js";

export { EmailPrimitive } from "./primitives/email.primitive.js";
export { MoneyPrimitive } from "./primitives/money.primitive.js";

export { UserShape } from "./shapes/user.shape.js";
export { ProfileShape } from "./shapes/profile.shape.js";
export { UserContactShape } from "./shapes/user-contact.shape.js";

export { VerifiedUserProof } from "./proofs/verified-user.proof.js";

export { Money } from "./capabilities/money.capability.js";
export { User } from "./capabilities/user.capability.js";
