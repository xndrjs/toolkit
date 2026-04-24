import type {
  BrandedRefinementCombineBuilder,
  BrandedRefinementKitLink,
  CombinedRefinementKit,
} from "./types";

/** Runtime chain storage; generic I/O is tracked only on the builder surface. */
type ErasedRefinementLink = BrandedRefinementKitLink<unknown, unknown>;

function assertDistinctInputRefinementBrands(kits: readonly { readonly brand: string }[]): void {
  const seen = new Set<string>();
  for (const k of kits) {
    if (seen.has(k.brand)) {
      throw new TypeError(
        `branded.refine(…).with(…): duplicate refinement brand "${k.brand}" in the chain — each kit’s .as("…") must be unique`
      );
    }
    seen.add(k.brand);
  }
}

function chainFrom(value: unknown, kits: readonly ErasedRefinementLink[]): unknown {
  let cur: unknown = value;
  for (const k of kits) {
    cur = k.from(cur);
  }
  return cur;
}

function chainTryFrom(value: unknown, kits: readonly ErasedRefinementLink[]): unknown | null {
  let cur: unknown = value;
  for (const k of kits) {
    const next = k.tryFrom(cur);
    if (next === null) {
      return null;
    }
    cur = next;
  }
  return cur;
}

function refinementCombineBuilder<I0, O0, R0>(
  kits: readonly ErasedRefinementLink[],
  createBase: (input: R0) => unknown
): BrandedRefinementCombineBuilder<I0, O0, R0> {
  return {
    with: <O2>(next: BrandedRefinementKitLink<O0, O2>) =>
      refinementCombineBuilder<I0, O2, R0>([...kits, next as ErasedRefinementLink], createBase),
    build: (): CombinedRefinementKit<I0, O0, R0> => {
      if (kits.length < 2) {
        throw new TypeError(
          "branded.refineChain(…).with(…).build(): chain at least two refinements — call .with(…) before .build()"
        );
      }
      assertDistinctInputRefinementBrands(kits);
      return {
        create: (input: R0) => chainFrom(createBase(input), kits.slice(1)) as O0,
        from: (value: I0) => chainFrom(value, kits) as O0,
        tryFrom: (value: I0) => chainTryFrom(value, kits) as O0 | null,
        is: (value: I0) => chainTryFrom(value, kits) !== null,
      };
    },
  };
}

/**
 * Start a fluent refinement chain from an existing refinement kit (not a shape / primitive kit).
 *
 * @example
 * branded.refineChain(R1).with(R2).with(R3).build()
 */
export function openRefinementCombineChain<I, O, R>(
  first: BrandedRefinementKitLink<I, O, R>
): BrandedRefinementCombineBuilder<I, O, R> {
  return refinementCombineBuilder<I, O, R>([first as ErasedRefinementLink], first.create);
}
