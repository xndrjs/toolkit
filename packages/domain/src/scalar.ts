/** Runtime scalar kinds accepted by {@link primitive} and {@link capabilities.forPrimitive}. */
export type Scalar = string | number | boolean | bigint | symbol;

/** Compile-time guard: only scalar validator outputs are accepted by {@link primitive}. */
export type ScalarOutput<Value> = Value extends Scalar ? Value : never;
