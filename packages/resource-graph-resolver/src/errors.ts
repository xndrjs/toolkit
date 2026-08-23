/** Thrown when {@link import("./types").ResolveContentGraphInput.signal} aborts resolution. */
export class ResolveContentGraphAbortedError extends Error {
  constructor(message = "Content graph resolution was aborted", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ResolveContentGraphAbortedError";
  }
}

export type ResolveContentGraphLimitKind = "maxRounds" | "maxResources" | "maxDepth";

/** Thrown when an optional graph budget on {@link import("./types").ResolveContentGraphInput.limits} is exceeded. */
export class ResolveContentGraphLimitExceededError extends Error {
  readonly limit: ResolveContentGraphLimitKind;
  readonly value: number;
  readonly max: number;

  constructor(limit: ResolveContentGraphLimitKind, value: number, max: number) {
    super(`Content graph resolution exceeded ${limit}: ${value} > ${max}`);
    this.name = "ResolveContentGraphLimitExceededError";
    this.limit = limit;
    this.value = value;
    this.max = max;
  }
}
