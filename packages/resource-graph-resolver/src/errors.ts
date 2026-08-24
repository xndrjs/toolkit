/** Thrown when {@link import("./types").ResolveContentGraphInput.signal} aborts resolution. */
export class ResolveContentGraphAbortedError extends Error {
  constructor(message = "Content graph resolution was aborted", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ResolveContentGraphAbortedError";
  }
}
