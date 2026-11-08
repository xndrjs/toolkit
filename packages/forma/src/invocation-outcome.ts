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

/** Catalogued Boundary error shape. `code` is the finite discriminant used by `out.match`. */
export type ExpectedError = Readonly<{ readonly code: string }>;

type MaybePromise<T> = T | Promise<T>;

type MatchResult<TargetSuccess, TargetErr> = MaybePromise<
  InvocationOutcome<TargetSuccess, TargetErr>
>;

type ExpectedErrorAtCode<Err extends ExpectedError, Code extends Err["code"]> = Err extends unknown
  ? Code extends Err["code"]
    ? { readonly [Key in keyof Err]: Key extends "code" ? Code : Err[Key] }
    : never
  : never;

type ExpectedErrorMatchHandlers<
  SourceErr extends ExpectedError,
  TargetSuccess,
  TargetErr,
> = Readonly<{
  [Code in SourceErr["code"]]: (
    error: ExpectedErrorAtCode<SourceErr, Code>
  ) => MatchResult<TargetSuccess, TargetErr>;
}>;

type OutcomeMatchHandlers<
  SourceSuccess,
  SourceErr extends ExpectedError,
  TargetSuccess,
  TargetErr,
> = Readonly<{
  success(value: SourceSuccess): MatchResult<TargetSuccess, TargetErr>;
}> &
  ([SourceErr] extends [never]
    ? { readonly expectedError?: never }
    : {
        readonly expectedError: ExpectedErrorMatchHandlers<SourceErr, TargetSuccess, TargetErr>;
      });

function unmatchedExpectedError(error: unknown): Error {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { readonly code: unknown }).code
      : undefined;
  return new Error(`out.match received an unhandled Expected Error code: ${String(code)}`, {
    cause: error,
  });
}

function matchOutcome<SourceSuccess, SourceErr extends ExpectedError, TargetSuccess, TargetErr>(
  outcome: InvocationOutcome<SourceSuccess, SourceErr>,
  handlers: OutcomeMatchHandlers<SourceSuccess, SourceErr, TargetSuccess, TargetErr>
): MatchResult<TargetSuccess, TargetErr> {
  switch (outcome.kind) {
    case "success":
      return handlers.success(outcome.value);
    case "expectedError": {
      const code = outcome.error.code;
      const cases = handlers.expectedError as
        | Readonly<Record<string, (error: SourceErr) => MatchResult<TargetSuccess, TargetErr>>>
        | undefined;
      const handler =
        typeof code === "string" && cases !== undefined && Object.hasOwn(cases, code)
          ? cases[code]
          : undefined;
      if (typeof handler !== "function") {
        throw unmatchedExpectedError(outcome.error);
      }
      return handler(outcome.error);
    }
    case "unexpectedFailure":
    case "cancelled":
      return outcome;
  }
}

/**
 * Create a new unexpected-failure token with a high-entropy opaque id.
 * Prefer this factory over forging objects; there is no public API that accepts arbitrary ids.
 */
export function createUnexpectedFailure(): UnexpectedFailure {
  const failure = { id: crypto.randomUUID() as FailureId };
  defineRuntimeBrand(failure, FORMA_UNEXPECTED_FAILURE, true);
  return Object.freeze(failure);
}

/** Successful contract outcome (unary value or stream item). */
export function success<T>(value: T): InvocationOutcome<T, never> {
  return { kind: "success", value };
}

/** Expected contract failure declared in `Err`. */
export function expectedError<E>(error: E): InvocationOutcome<never, E> {
  return { kind: "expectedError", error };
}

/**
 * Unexpected failure branch.
 *
 * - `unexpectedFailure(failure)` — wrap an existing {@link createUnexpectedFailure} token
 *   (two-step when reporting ownership must remain fully explicit).
 * - `unexpectedFailure()` — create a token and wrap it in one step.
 * - `unexpectedFailure(report)` — create a token, await the report callback, then wrap it.
 *
 * The report overload always returns a Promise, even when the callback is synchronous. Report
 * values are ignored and report throw/rejection is isolated so diagnostics cannot replace the
 * original failure. Explicit paths do not notify `compose({ onUnexpectedFailure })`.
 */
export function unexpectedFailure(): InvocationOutcome<never, never>;
export function unexpectedFailure(failure: UnexpectedFailure): InvocationOutcome<never, never>;
export function unexpectedFailure<ReportResult>(
  report: (failure: UnexpectedFailure) => ReportResult | PromiseLike<ReportResult>
): Promise<InvocationOutcome<never, never>>;
export function unexpectedFailure(
  failureOrReport?: UnexpectedFailure | ((failure: UnexpectedFailure) => unknown)
): InvocationOutcome<never, never> | Promise<InvocationOutcome<never, never>> {
  if (typeof failureOrReport === "function") {
    return createReportedUnexpectedFailure(failureOrReport);
  }
  const failure = failureOrReport ?? createUnexpectedFailure();
  return { kind: "unexpectedFailure", failure };
}

async function createReportedUnexpectedFailure(
  report: (failure: UnexpectedFailure) => unknown
): Promise<InvocationOutcome<never, never>> {
  const failure = createUnexpectedFailure();
  try {
    await report(failure);
  } catch {
    // Diagnostic delivery is best-effort; keep the original failure as the outcome.
  }
  return { kind: "unexpectedFailure", failure };
}

/** Cancellation branch; pass a token from {@link createCancellation} (or a propagated one). */
export function cancelled(cancellation: Cancellation): InvocationOutcome<never, never> {
  return { kind: "cancelled", cancellation };
}

/**
 * Contract-scoped constructors for {@link InvocationOutcome}.
 * On Provider `.with`, Forma injects `ctx.out` typed to that Intent's `Success` / `Err`.
 * Matching belongs to this contract-scoped API because an unhandled runtime Expected Error
 * must be totalized at the Boundary invocation currently translating it.
 *
 * Expected Error payloads use a finite `code` discriminant (not `kind`) so the protocol tag
 * (`outcome.kind`) stays distinct from catalogued error tags.
 *
 * Method syntax (not function properties) keeps `ContractOut` assignable across
 * Provider widenings — including `Err = never` — under TypeScript's bivariant methods.
 */
export type ContractOut<Success, Err> = Readonly<{
  success(value: Success): InvocationOutcome<Success, never>;
  expectedError(error: Err): InvocationOutcome<never, Err>;
  match<SourceSuccess, SourceErr extends ExpectedError>(
    outcome: InvocationOutcome<SourceSuccess, SourceErr>,
    handlers: OutcomeMatchHandlers<SourceSuccess, SourceErr, Success, Err>
  ): MatchResult<Success, Err>;
  unexpectedFailure(): InvocationOutcome<never, never>;
  unexpectedFailure(failure: UnexpectedFailure): InvocationOutcome<never, never>;
  unexpectedFailure<ReportResult>(
    report: (failure: UnexpectedFailure) => ReportResult | PromiseLike<ReportResult>
  ): Promise<InvocationOutcome<never, never>>;
  cancelled(cancellation: Cancellation): InvocationOutcome<never, never>;
}>;

/**
 * Open-generic outcome constructors. Prefer contract-scoped `ctx.out` inside Provider factories.
 */
export const out = Object.freeze({
  success,
  expectedError,
  unexpectedFailure,
  cancelled,
});

/** Internal runtime object injected as the contract-scoped `ctx.out`. */
export const contractOut = Object.freeze({
  ...out,
  match: matchOutcome,
});

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
