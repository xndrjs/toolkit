import { z } from "zod";

import { BrandedValidationError } from "./errors";
import { Branded, BrandedProofBuilder, BrandedProofKit } from "./types";

function mergeProofOntoInput<T extends object, Out>(input: T, parsedSlice: Out): T & Out {
  const merged = Object.assign(Object.create(Object.getPrototypeOf(input)), input, parsedSlice);
  return Object.freeze(merged) as T & Out;
}

function proofGuardZodError(brand: string): z.ZodError {
  return new z.ZodError([
    {
      code: "custom",
      path: [],
      message: `Proof refineType guard failed for "${brand}"`,
    },
  ]);
}

function proofCandidate<Schema extends z.ZodType, T extends z.input<Schema>>(
  input: T,
  parsed: z.output<Schema>
): z.output<Schema> {
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    return mergeProofOntoInput(input, parsed) as z.output<Schema>;
  }
  return parsed;
}

function buildProofKit<Brand extends string, Schema extends z.ZodType, Patch = unknown>(
  brand: Brand,
  schema: Schema,
  guard: ((data: z.output<Schema>) => boolean) | undefined
): BrandedProofKit<Brand, Schema, z.output<Schema> & Patch> {
  type Out = z.output<Schema> & Patch;
  type Input = z.input<Schema>;
  type ProofValue = Branded<Brand, Out>;

  function runGuard<const T extends Input>(input: T, parsed: z.output<Schema>): void {
    if (!guard) return;
    const candidate = proofCandidate(input, parsed);
    if (!guard(candidate)) {
      throw new BrandedValidationError(
        `Proof refineType guard failed for "${brand}"`,
        proofGuardZodError(brand)
      );
    }
  }

  function parseImpl<const T extends Input>(input: T): T & ProofValue;
  function parseImpl(input: Input): ProofValue;
  function parseImpl<const T extends Input>(input: T): (T & ProofValue) | ProofValue {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      throw new BrandedValidationError(`Invalid value for proof "${brand}"`, parsed.error);
    }
    runGuard(input, parsed.data);
    if (typeof input === "object" && input !== null && !Array.isArray(input)) {
      return mergeProofOntoInput(input, parsed.data) as T & ProofValue;
    }
    return parsed.data as ProofValue;
  }

  function safeParseImpl<const T extends Input>(
    input: T
  ): { success: true; data: T & ProofValue } | { success: false; error: z.ZodError };
  function safeParseImpl(
    input: Input
  ): { success: true; data: ProofValue } | { success: false; error: z.ZodError };
  function safeParseImpl<const T extends Input>(
    input: T
  ):
    | { success: true; data: (T & ProofValue) | ProofValue }
    | { success: false; error: z.ZodError } {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error };
    }
    const candidate = proofCandidate(input, parsed.data);
    if (guard && !guard(candidate)) {
      return { success: false, error: proofGuardZodError(brand) };
    }
    if (typeof input === "object" && input !== null && !Array.isArray(input)) {
      return { success: true, data: mergeProofOntoInput(input, parsed.data) as T & ProofValue };
    }
    return { success: true, data: parsed.data as ProofValue };
  }

  function is(value: unknown): value is ProofValue {
    const parsed = schema.safeParse(value);
    if (!parsed.success) return false;
    const input = value as z.input<Schema>;
    const candidate = proofCandidate(input, parsed.data);
    if (guard && !guard(candidate)) return false;
    return true;
  }

  return {
    brand,
    schema,
    parse: parseImpl,
    safeParse: safeParseImpl,
    is,
  };
}

/**
 * Zod-first **proof**: nominal guarantee for values assignable to **`z.input<Schema>`**.
 *
 * **`branded.proof(brand, schema)`** returns a kit with optional **`refineType`**:
 * **`refineType<Patch>((data) => ...)`** applies a guard beyond Zod and sets **`Out`** to
 * **`z.output<Schema> & Patch`**. Without **`refineType`**, **`Out`** is **`z.output<Schema>`**.
 */
export function defineBrandedProof<Brand extends string, Schema extends z.ZodType>(
  brand: Brand,
  schema: Schema
): BrandedProofBuilder<Brand, Schema> {
  const kit = buildProofKit<Brand, Schema, unknown>(brand, schema, undefined);
  return Object.assign(kit, {
    refineType<const Patch extends Partial<z.output<Schema>>>(
      guard: (data: z.output<Schema>) => boolean
    ): BrandedProofKit<Brand, Schema, z.output<Schema> & Patch> {
      return buildProofKit<Brand, Schema, Patch>(brand, schema, guard);
    },
  }) as BrandedProofBuilder<Brand, Schema>;
}
