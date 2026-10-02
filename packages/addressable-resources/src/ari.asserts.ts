import { createAri } from "./create-ari";

/**
 * Compile-only checks for allowed Addressable Resource Identifier keys.
 * Not meant to run at runtime.
 */
export function assertAddressableResourceKeyTypes(): void {
  createAri("valid", { taskId: "task-123", userId: null });

  // @ts-expect-error -- nested objects are not allowed in key values
  createAri("invalid", { nested: { taskId: "task-123" } });

  // @ts-expect-error -- arrays are not allowed as the key
  createAri("invalid", ["nested-array"]);

  // @ts-expect-error -- undefined is not allowed in key values
  createAri("invalid", { taskId: undefined });

  // @ts-expect-error -- multi-segment / rest key args are not allowed
  createAri("invalid", { taskId: "task-123" }, "scope");
}
