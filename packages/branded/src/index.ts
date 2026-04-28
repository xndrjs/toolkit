export * from "./api";
export * from "./presets";
export * from "./types";
export * from "./errors";

/**
 * `__brand` is type-only for nominal `Branded` / `.d.ts` emit.
 * Exported so dependent projects with `declaration: true` can name these in emitted `.d.ts` (e.g. avoids TS4023).
 * Prefer not importing them in application code; use ESLint `no-restricted-imports` if you want to enforce that.
 */
export { __brand, __shapeMarker, __shapePatch } from "./private-constants";
