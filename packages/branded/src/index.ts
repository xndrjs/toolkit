export * from "./api";
export * from "./anemic";
export * from "./types";
export * from "./errors";

/**
 * Runtime symbol keys used by {@link import("./types").Branded} and {@link import("./types").AnemicOutput}.
 * Exported so dependent projects with `declaration: true` can name these in emitted `.d.ts` (e.g. avoids TS4023).
 * Prefer not importing them in application code; use ESLint `no-restricted-imports` if you want to enforce that.
 */
export { __anemicOutput, __brand } from "./private-constants";
