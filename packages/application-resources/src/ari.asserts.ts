import { createAri } from "./create-ari";

/**
 * Compile-only checks for allowed Application Resource Identifier keys.
 * Not meant to run at runtime.
 */
export function assertApplicationResourceKeyTypes(): void {
  createAri("valid", { taskId: "task-123", userId: null });
  createAri("valid", "scope", { taskId: "task-123" });

  // @ts-expect-error -- nested objects are not allowed in key parts
  createAri("invalid", { nested: { taskId: "task-123" } });

  // @ts-expect-error -- nested arrays are not allowed in key parts
  createAri("invalid", ["nested-array"]);

  // @ts-expect-error -- undefined is not allowed in key parts
  createAri("invalid", undefined);
}
