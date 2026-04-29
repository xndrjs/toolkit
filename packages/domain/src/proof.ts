import type { Branded } from "./branded";
import type { Validator } from "./validation";

export type ProofValue<ProofBrand extends string, T> = Readonly<Branded<ProofBrand, T>>;

export interface ProofKit<ProofBrand extends string, Input, BaseOut, NarrowedOut = BaseOut> {
  readonly brand: ProofBrand;
  readonly validator: Validator<Input, BaseOut>;

  assert<T extends Input>(value: T): ProofValue<ProofBrand, T & NarrowedOut>;
  test(value: unknown): value is ProofValue<ProofBrand, NarrowedOut>;

  refineType<Patch extends object>(
    guard: (row: BaseOut) => row is BaseOut & Patch
  ): ProofKit<ProofBrand, Input, BaseOut, BaseOut & Patch>;
}

/**
 * Defines a composable semantic proof. Runtime implementation follows in the next milestone.
 */
export function proof<ProofBrand extends string, Input, Out>(
  _brand: ProofBrand,
  _validator: Validator<Input, Out>
): ProofKit<ProofBrand, Input, Out, Out> {
  throw new Error("@xndrjs/domain: `proof` is not implemented yet");
}
