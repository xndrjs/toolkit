/**
 * **Internal / advanced entrypoint** — not for normal application code.
 *
 * Re-exports runtime symbols used in public types (`Branded`, `AnemicOutput`, …) so TypeScript can
 * emit declaration files in dependent projects (e.g. avoids TS4023 when exporting values whose types
 * reference these keys).
 *
 * Import `@xndrjs/branded/internal` only for **tests, tooling, or framework code** that must touch
 * brand metadata. Prefer blocking this path in app source with ESLint `no-restricted-imports`
 * (see package README).
 *
 * @packageDocumentation
 */
export { __anemicOutput, __brand } from "./private-constants";
