// Runtime symbols; re-exported from the package entry for typing / declaration emit (see index.ts).

/**
 * Hidden nominal marker. `unique symbol` prevents manual brand construction.
 */
export const __brand: unique symbol = Symbol("__brand");

/**
 * Hidden anemic-output marker. `unique symbol` prevents manual output proof construction.
 */
export const __anemicOutput: unique symbol = Symbol("__anemicOutput");
