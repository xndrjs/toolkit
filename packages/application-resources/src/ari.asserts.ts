import { ari } from "./ari";

/**
 * Compile-only checks for allowed Application Resource Identifier keys.
 * Not meant to run at runtime.
 */
export function assertApplicationResourceKeyTypes(): void {
  ari("valid", [{ taskId: "task-123", userId: null }] as const);
  ari("valid", ["scope", { taskId: "task-123" }] as const);

  // @ts-expect-error -- nested objects are not allowed in key parts
  ari("invalid", [{ nested: { taskId: "task-123" } }] as const);

  // @ts-expect-error -- nested arrays are not allowed in key parts
  ari("invalid", [["nested-array"]] as const);

  // @ts-expect-error -- undefined is not allowed in key parts
  ari("invalid", [undefined] as const);
}
