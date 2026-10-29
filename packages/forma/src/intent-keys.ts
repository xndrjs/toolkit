import { intentIdentity, type IntentIdentity } from "./boundary.js";

/** Display label for diagnostics — not the identity key (dots in ids stay ambiguous). */
export function intentLabel(intent: {
  readonly boundaryId: string;
  readonly name: string;
}): string {
  return `${intent.boundaryId}.${intent.name}`;
}

/**
 * Unambiguous runtime map key for Intent identity.
 * JSON pair encoding distinguishes (`"a.b"`, `"c"`) from (`"a"`, `"b.c"`).
 */
export function intentMapKey(intent: {
  readonly boundaryId: string;
  readonly name: string;
}): string {
  return JSON.stringify(intentIdentity(intent));
}

/** Decode a trusted internal map key back to the structured public identity. */
export function intentIdentityFromMapKey(key: string): IntentIdentity {
  const parsed: unknown = JSON.parse(key);
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 2 ||
    typeof parsed[0] !== "string" ||
    typeof parsed[1] !== "string"
  ) {
    throw new Error(`Invalid Intent map key: ${key}`);
  }
  return Object.freeze([parsed[0], parsed[1]]) as IntentIdentity;
}
