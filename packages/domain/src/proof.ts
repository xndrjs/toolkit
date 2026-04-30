import type { Branded } from "./branded";
import { DomainValidationError } from "./errors";
import type { ValidationFailure } from "./validation";
import type { Validator } from "./validation";

export type ProofValue<ProofBrand extends string, T> = Readonly<Branded<ProofBrand, T>>;

/** Final proof kit (no further `refineType` on the object). */
export interface ProofKit<
  ProofBrand extends string,
  Input,
  BaseOut,
  NarrowedOut extends BaseOut = BaseOut,
> {
  readonly brand: ProofBrand;
  readonly validator: Validator<Input, BaseOut>;

  assert<T extends Input>(value: T): ProofValue<ProofBrand, T & NarrowedOut>;
  test(value: unknown): value is ProofValue<ProofBrand, NarrowedOut>;
}

/** Kit returned from {@link proof} before {@link ProofFactory.refineType}. */
export interface ProofFactory<ProofBrand extends string, Input, Out> extends ProofKit<
  ProofBrand,
  Input,
  Out,
  Out
> {
  refineType<Patch extends object>(
    guard: (row: Out) => row is Out & Patch
  ): ProofKit<ProofBrand, Input, Out, Out & Patch>;
}

function mergeProofOntoInput<T extends object, Out>(input: T, parsedSlice: Out): T & Out {
  const merged = Object.assign(Object.create(Object.getPrototypeOf(input)), input, parsedSlice);
  return Object.freeze(merged) as T & Out;
}

function proofCandidate<Input, BaseOut>(input: Input, parsed: BaseOut): BaseOut {
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    return mergeProofOntoInput(input as object, parsed as object) as BaseOut;
  }
  return parsed;
}

function guardFailure(brand: string): ValidationFailure {
  return {
    engine: "domain",
    issues: [
      {
        code: "PROOF_GUARD",
        path: [],
        message: `Proof refineType guard failed for "${brand}"`,
      },
    ],
  };
}

function buildProofKit<
  ProofBrand extends string,
  Input,
  BaseOut,
  Narrowed extends BaseOut = BaseOut,
>(
  brand: ProofBrand,
  validator: Validator<Input, BaseOut>,
  guard: ((row: BaseOut) => row is Narrowed) | undefined
): ProofKit<ProofBrand, Input, BaseOut, Narrowed> {
  function runGuard(input: Input, parsed: BaseOut): void {
    if (!guard) return;
    const candidate = proofCandidate(input, parsed);
    if (!guard(candidate)) {
      throw new DomainValidationError(
        `Proof refineType guard failed for "${brand}"`,
        guardFailure(brand)
      );
    }
  }

  function assertImpl<const T extends Input>(input: T): ProofValue<ProofBrand, T & Narrowed> {
    const result = validator.validate(input);
    if (!result.success) {
      throw new DomainValidationError(`Invalid value for proof "${brand}"`, result.error);
    }
    runGuard(input, result.data);
    if (typeof input === "object" && input !== null && !Array.isArray(input)) {
      return mergeProofOntoInput(input, result.data) as ProofValue<ProofBrand, T & Narrowed>;
    }
    return result.data as ProofValue<ProofBrand, T & Narrowed>;
  }

  function testImpl(value: unknown): value is ProofValue<ProofBrand, Narrowed> {
    const result = validator.validate(value);
    if (!result.success) {
      return false;
    }
    const candidate = proofCandidate(value as Input, result.data);
    if (guard && !guard(candidate)) {
      return false;
    }
    return true;
  }

  return {
    brand,
    validator,
    assert: assertImpl,
    test: testImpl,
  };
}

/**
 * Composable semantic proof: validates with {@link Validator}, optional {@link ProofFactory.refineType} guard,
 * nominal proof brand. For plain objects, preserves the input prototype and merges parsed fields (then freezes).
 */
export function proof<ProofBrand extends string, Input, Out>(
  brand: ProofBrand,
  validator: Validator<Input, Out>
): ProofFactory<ProofBrand, Input, Out> {
  const base = buildProofKit(brand, validator, undefined);
  return Object.assign(base, {
    refineType<Patch extends object>(guard: (row: Out) => row is Out & Patch) {
      return buildProofKit(brand, validator, guard);
    },
  }) as ProofFactory<ProofBrand, Input, Out>;
}
