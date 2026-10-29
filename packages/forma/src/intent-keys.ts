import { intentIdentity } from "./boundary.js";

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
