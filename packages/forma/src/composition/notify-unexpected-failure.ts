import type { OnUnexpectedFailure, UnexpectedFailureEvent } from "./composition-contract.js";

/**
 * Default Composition supervision hook: print the event (including raw cause) so the
 * automatic totalization path does not silently drop diagnostics.
 * Delegates to `console.error` at call time (not a bound reference) so hosts can redirect logging.
 */
export const defaultOnUnexpectedFailure: OnUnexpectedFailure = (event) => {
  console.error(event);
};

/** Resolve the Composition hook; omitted option uses {@link defaultOnUnexpectedFailure}. */
export function resolveOnUnexpectedFailure(
  onUnexpectedFailure: OnUnexpectedFailure | undefined
): OnUnexpectedFailure {
  return onUnexpectedFailure ?? defaultOnUnexpectedFailure;
}

/**
 * Notify the Composition hook for a core-generated unexpected failure.
 *
 * Exact semantics (boundary-error-totalization):
 * - synchronous, best-effort (does not await Promises);
 * - isolates hook throws — never replaces the failure, reopens the exceptional channel,
 *   or re-enters this notifier recursively;
 * - does not modify the caller-facing InvocationOutcome.
 *
 * Call only for automatic throw/rejection conversion. Explicit Boundary
 * `createUnexpectedFailure` paths and propagated failures must not notify.
 */
export function notifyUnexpectedFailure(
  onUnexpectedFailure: OnUnexpectedFailure,
  event: UnexpectedFailureEvent
): void {
  try {
    onUnexpectedFailure(event);
  } catch {
    // Diagnostic delivery is best-effort; keep the original failure as the outcome.
  }
}
