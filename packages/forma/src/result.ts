/**
 * Discriminated success / expected-failure outcome for Intent contracts (PoC).
 * Unexpected technical failures stay outside this representation.
 */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** Successful contract outcome. */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/** Expected contract failure. */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
