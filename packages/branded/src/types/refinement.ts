import { Branded } from "./common";

export type RefinementResult<Brand extends string, NewType> = Branded<Brand, NewType>;

/**
 * Value type after a refinement: base `TBase` + data narrowing + refinement brand.
 * `NewType` must be the **narrowed data** (e.g. `UserEntity & { … }`), not `Branded<Brand, …>` —
 * {@link RefinementResult} already applies `Branded<Brand, NewType>` once.
 *
 * Instance methods come only from the underlying shape prototype, not from refinements.
 *
 * Matches `from` / `tryFrom` when called with `TBase` (e.g. `UserEntity`). For stacked refinements,
 * `TBase` is the already-refined input type.
 */
export type RefinementInstance<TBase, Brand extends string, NewType> = TBase &
  RefinementResult<Brand, NewType>;

/**
 * Structural minimum for a refinement kit returned by {@link import("../branded-refinement").defineBrandedRefine}.
 * Used to chain refinements without re-stating `when` predicates.
 */
export interface BrandedRefinementKitLink<TInput, TOutput, TRawInput = TInput> {
  readonly brand: string;
  create: (input: TRawInput) => TOutput;
  from: (value: TInput) => TOutput;
  tryFrom: (value: TInput) => TOutput | null;
  // Wider than the kit’s type guard so sibling kits on the same base stay composable.
  is: (value: TInput) => boolean;
}

/** Kit produced by **`branded.refineChain(firstRefinement).with(…).build()`** (no synthetic `brand`; step kits keep their own). */
export interface CombinedRefinementKit<TInput, TOutput, TRawInput = TInput> {
  create: (input: TRawInput) => TOutput;
  from: (value: TInput) => TOutput;
  tryFrom: (value: TInput) => TOutput | null;
  is: (value: TInput) => boolean;
}

/**
 * Fluent chain from **`branded.refineChain(firstKit)`**: `.with` adds the next refinement;
 * `.build()` finishes the composite kit (requires at least two refinements total).
 */
export interface BrandedRefinementCombineBuilder<TInput, TCurrent, TRawInput = TInput> {
  with<O2>(
    kit: BrandedRefinementKitLink<TCurrent, O2>
  ): BrandedRefinementCombineBuilder<TInput, O2, TRawInput>;
  build(): CombinedRefinementKit<TInput, TCurrent, TRawInput>;
}
