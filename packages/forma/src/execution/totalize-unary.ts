import type { IntentIdentity } from "../boundary.js";
import type {
  OnUnexpectedFailure,
  UnexpectedFailurePhase,
} from "../composition/composition-contract.js";
import { notifyUnexpectedFailure } from "../composition/notify-unexpected-failure.js";
import {
  createUnexpectedFailure,
  unexpected,
  type InvocationOutcome,
  type UnexpectedFailure,
} from "../invocation-outcome.js";
import { defineRuntimeBrand, readRuntimeBrand } from "../protocol/runtime-brand.js";
import type { IntentOperation, ProviderOrigin } from "../provider/provider.js";

const FORMA_TOTALIZED_MATERIALIZATION = Symbol.for("@xndrjs/forma/totalized-materialization/v1");

type UnexpectedOutcome = {
  readonly kind: "unexpected";
  readonly failure: UnexpectedFailure;
};

/**
 * Carrier thrown from unary Provider factory failure after core totalization.
 * Preserves a single origin failure through nested materialization rollbacks so the
 * invoke site can return {@link InvocationOutcome} without re-notifying.
 */
export type TotalizedMaterializationFailure = Readonly<{
  readonly outcome: UnexpectedOutcome;
}>;

export type TotalizationMeta = {
  readonly intent: IntentIdentity;
  readonly origin: ProviderOrigin;
  readonly onUnexpectedFailure: OnUnexpectedFailure;
};

export function isTotalizedMaterializationFailure(
  value: unknown
): value is TotalizedMaterializationFailure {
  return readRuntimeBrand(value, FORMA_TOTALIZED_MATERIALIZATION) === true;
}

/** Extract a totalized materialization outcome, if `value` is the internal carrier. */
export function outcomeFromTotalizedMaterialization(value: unknown): UnexpectedOutcome | undefined {
  return isTotalizedMaterializationFailure(value) ? value.outcome : undefined;
}

/**
 * Core automatic path: new failure id, notify Composition once, return `unexpected`.
 * Must not be used for explicit Boundary {@link createUnexpectedFailure} or propagation.
 */
export function createAutomaticUnexpected(
  cause: unknown,
  meta: TotalizationMeta & { readonly phase: UnexpectedFailurePhase }
): UnexpectedOutcome {
  const failure = createUnexpectedFailure();
  notifyUnexpectedFailure(meta.onUnexpectedFailure, {
    failure,
    cause,
    intent: meta.intent,
    origin: meta.origin,
    phase: meta.phase,
  });
  return unexpected(failure) as UnexpectedOutcome;
}

/**
 * Convert a unary factory throw/rejection into a totalized materialization carrier and throw it.
 * Nested materialize sites must rethrow without creating a second failure.
 */
export function throwTotalizedMaterializationFailure(
  cause: unknown,
  meta: TotalizationMeta
): never {
  if (isTotalizedMaterializationFailure(cause)) {
    throw cause;
  }
  const outcome = createAutomaticUnexpected(cause, { ...meta, phase: "materialize" });
  const carrier = { outcome };
  defineRuntimeBrand(carrier, FORMA_TOTALIZED_MATERIALIZATION, true);
  throw Object.freeze(carrier);
}

/**
 * Totalize sync throws and Promise rejections of a unary Intent operation.
 * Outcomes already in protocol (including `unexpected` / `cancelled`) pass through unchanged.
 */
export function wrapUnaryOperation(
  operation: IntentOperation<unknown, unknown, unknown>,
  meta: TotalizationMeta
): IntentOperation<unknown, unknown, unknown> {
  return (input) => {
    try {
      const result = operation(input);
      if (isThenable(result)) {
        return Promise.resolve(result).then(
          (outcome) => outcome,
          (cause) => createAutomaticUnexpected(cause, { ...meta, phase: "invoke" })
        );
      }
      return result;
    } catch (cause) {
      return createAutomaticUnexpected(cause, { ...meta, phase: "invoke" });
    }
  };
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}
