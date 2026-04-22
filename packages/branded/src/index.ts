export * from "./api";
export * from "./anemic";
export * from "./types";
export * from "./errors";

/**
 * `__brand` is type-only for nominal `Branded` / `.d.ts` emit; **`__anemicOutput`** marks anemic outputs.
 * Exported so dependent projects with `declaration: true` can name these in emitted `.d.ts` (e.g. avoids TS4023).
 * Prefer not importing them in application code; use ESLint `no-restricted-imports` if you want to enforce that.
 */
export { __anemicOutput, __brand } from "./private-constants";
