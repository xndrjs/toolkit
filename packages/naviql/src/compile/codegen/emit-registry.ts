import type { Program } from "../../ir";
import { payloadTypeName } from "./naming";

/** True when `ariType` can appear as an unquoted TypeScript object-type key. */
function isValidIdentifier(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

function registryKey(ariType: string): string {
  return isValidIdentifier(ariType) ? ariType : JSON.stringify(ariType);
}

/**
 * Emit a `ContentRegistry` (or renamed) slice mapping ariType → payload type.
 *
 * ```ts
 * export type ContentRegistry = {
 *   Post: PostPayload;
 *   User: UserPayload;
 * };
 * ```
 *
 * Keys are `resource.ariType` (quoted when not a valid identifier).
 * Values are `*Payload` types keyed by resource name.
 */
export function emitRegistry(program: Program, registryTypeName: string): string {
  if (program.resources.length === 0) {
    return "";
  }

  const entries = program.resources.map((resource) => {
    const key = registryKey(resource.ariType);
    const payload = payloadTypeName(resource.name);
    return `  ${key}: ${payload};`;
  });

  return [`export type ${registryTypeName} = {`, ...entries, `};`].join("\n");
}
