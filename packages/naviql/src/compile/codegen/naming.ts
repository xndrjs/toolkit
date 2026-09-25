/**
 * Factory / type names for resource codegen.
 * `Post` → `postAri`, `PostPayload`, `PostResource`.
 */

/** Lowercase the first character (`Post` → `post`). */
export function uncapitalize(name: string): string {
  if (name.length === 0) {
    return name;
  }
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/** `Post` → `postAri` */
export function ariFactoryName(resourceName: string): string {
  return `${uncapitalize(resourceName)}Ari`;
}

/** `Post` → `PostPayload` */
export function payloadTypeName(resourceName: string): string {
  return `${resourceName}Payload`;
}

/** `Post` → `PostResource` */
export function resourceTypeName(resourceName: string): string {
  return `${resourceName}Resource`;
}
