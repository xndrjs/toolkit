// Runtime symbols; re-exported for typing / advanced use via `@xndrjs/branded/internal`.

/**
 * Hidden nominal marker. `unique symbol` prevents manual brand construction.
 */
export const __brand: unique symbol = Symbol("__brand");

/**
 * Hidden anemic-output marker. `unique symbol` prevents manual output proof construction.
 */
export const __anemicOutput: unique symbol = Symbol("__anemicOutput");
