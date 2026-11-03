import { defineRuntimeBrand, readRuntimeBrand } from "./protocol/runtime-brand.js";

declare const failureIdBrand: unique symbol;
declare const cancellationBrand: unique symbol;

const FORMA_UNEXPECTED_FAILURE = Symbol.for("@xndrjs/forma/unexpected-failure/v1");
const FORMA_CANCELLATION = Symbol.for("@xndrjs/forma/cancellation/v1");

/**
 * Opaque correlation token for a single unexpected failure.
 * Identifies the failure, not a request or execution context.
 */
export type FailureId = string & { readonly [failureIdBrand]: void };

/**
 * Data token for an unexpected failure. Carries only an opaque id — never cause,
 * message, stack, producer details, or invocation input.
 */
export type UnexpectedFailure = Readonly<{
  readonly id: FailureId;
}>;

/**
 * Opaque cancellation token for the `cancelled` {@link InvocationOutcome} branch.
 * Full abort↔cancellation normalization remains tied to ADR 0008; this type completes
 * the four-kind protocol so callers and Adapters can pass cancellation through unchanged.
 */
export type Cancellation = Readonly<{
  readonly [cancellationBrand]?: void;
}>;

/**
 * Totalized exit of a Boundary Intent invocation (unary value or stream event).
 * Expected errors stay in `expectedError`; throw/rejection become `unexpectedFailure` at the origin.
 */
export type InvocationOutcome<Success, ExpectedError> =
  | { readonly kind: "success"; readonly value: Success }
  | { readonly kind: "expectedError"; readonly error: ExpectedError }
  | { readonly kind: "unexpectedFailure"; readonly failure: UnexpectedFailure }
  | { readonly kind: "cancelled"; readonly cancellation: Cancellation };

/** Successful contract outcome (unary value or stream item). */
export function success<T>(value: T): InvocationOutcome<T, never> {
  return { kind: "success", value };
}

/** Expected contract failure declared in `Err`. */
export function expectedError<E>(error: E): InvocationOutcome<never, E> {
  return { kind: "expectedError", error };
}

/**
 * Unexpected failure branch; pass a token from {@link createUnexpectedFailure}.
 * Prefer logging / correlating `failure.id` before returning this outcome.
 */
export function unexpectedFailure(failure: UnexpectedFailure): InvocationOutcome<never, never> {
  return { kind: "unexpectedFailure", failure };
}

/** Cancellation branch; pass a token from {@link createCancellation} (or a propagated one). */
export function cancelled(cancellation: Cancellation): InvocationOutcome<never, never> {
  return { kind: "cancelled", cancellation };
}

/**
 * Contract-scoped constructors for {@link InvocationOutcome}.
 * On Provider `.with`, Forma injects `ctx.out` typed to that Intent's `Success` / `Err`.
 * The module-level {@link out} export is the same runtime object with open generics —
 * prefer `ctx.out` inside Provider factories.
 *
 * Expected Error payloads conventionally use a `code` discriminant (not `kind`) so the
 * protocol tag (`outcome.kind`) stays distinct from domain error tags.
 */
/**
 * Method syntax (not function properties) keeps `ContractOut` assignable across
 * Provider widenings — including `Err = never` — under TypeScript's bivariant methods.
 */
export type ContractOut<Success, Err> = Readonly<{
  success(value: Success): InvocationOutcome<Success, never>;
  expectedError(error: Err): InvocationOutcome<never, Err>;
  unexpectedFailure(failure: UnexpectedFailure): InvocationOutcome<never, never>;
  cancelled(cancellation: Cancellation): InvocationOutcome<never, never>;
}>;

/**
 * Open-generic constructors (same runtime object injected as typed {@link ContractOut} on
 * `ctx.out`). Prefer `ctx.out` inside Provider factories.
 */
export const out = Object.freeze({
  success,
  expectedError,
  unexpectedFailure,
  cancelled,
});

/**
 * Create a new unexpected-failure token with a high-entropy opaque id.
 * Prefer this factory over forging objects; there is no public API that accepts arbitrary ids.
 */
export function createUnexpectedFailure(): UnexpectedFailure {
  const failure = { id: crypto.randomUUID() as FailureId };
  defineRuntimeBrand(failure, FORMA_UNEXPECTED_FAILURE, true);
  return Object.freeze(failure);
}

/** Runtime authenticity check for values created by {@link createUnexpectedFailure}. */
export function isUnexpectedFailure(value: unknown): value is UnexpectedFailure {
  return readRuntimeBrand(value, FORMA_UNEXPECTED_FAILURE) === true;
}

/** Create a new opaque cancellation token. */
export function createCancellation(): Cancellation {
  const cancellation = {};
  defineRuntimeBrand(cancellation, FORMA_CANCELLATION, true);
  return Object.freeze(cancellation) as Cancellation;
}

/** Runtime authenticity check for values created by {@link createCancellation}. */
export function isCancellation(value: unknown): value is Cancellation {
  return readRuntimeBrand(value, FORMA_CANCELLATION) === true;
}

/**
 * Stream-terminal contract kinds (`expectedError` / `unexpectedFailure` / `cancelled`).
 * `success` is repeatable; natural iterator completion is a correct end without a terminal yield.
 */
export function isTerminalOutcome(
  value: unknown
): value is Extract<
  InvocationOutcome<unknown, unknown>,
  { readonly kind: "expectedError" | "unexpectedFailure" | "cancelled" }
> {
  if (typeof value !== "object" || value === null || !("kind" in value)) {
    return false;
  }
  const kind = (value as { readonly kind: unknown }).kind;
  return kind === "expectedError" || kind === "unexpectedFailure" || kind === "cancelled";
}
