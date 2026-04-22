// Runtime symbols; re-exported from the package entry for typing / declaration emit (see index.ts).

/**
 * Nominal marker for **TypeScript** (`Branded`); not written onto runtime object instances.
 * Exported so dependents with `declaration: true` can name it in emitted `.d.ts`.
 */
export const __brand: unique symbol = Symbol("__brand");

/**
 * Hidden anemic-output marker. `unique symbol` prevents manual output proof construction.
 */
export const __anemicOutput: unique symbol = Symbol("__anemicOutput");
