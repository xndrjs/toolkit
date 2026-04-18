import { DEFAULT_MAX_ATTEMPTS } from "./constants";
import type { RetryOptions } from "./types";

function assertMaxAttempts(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`maxAttempts must be an integer >= 1, got ${String(value)}`);
  }
  return value;
}

export function resolveMaxAttempts(options?: RetryOptions): number {
  return assertMaxAttempts(options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
}
