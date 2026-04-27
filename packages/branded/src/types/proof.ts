import { z } from "zod";

import { Branded } from "./common";

/**
 * Kit returned by **`branded.proof(brand, schema)`** with optional **`refineType`**.
 *
 * **`refineType<Patch>(guard)`** narrows the proof’s **`Out`** to **`z.output<Schema> & Patch`**
 * (e.g. **`Patch = { isVerified: true }`**) in addition to Zod validation; the guard must be
 * consistent with **`Patch`**. The return value is a **`BrandedProofKit`** without a further **`refineType`**.
 */
export type BrandedProofBuilder<Brand extends string, Schema extends z.ZodType> = BrandedProofKit<
  Brand,
  Schema,
  z.output<Schema>
> & {
  refineType<const Patch extends Partial<z.output<Schema>>>(
    guard: (data: z.output<Schema>) => boolean
  ): BrandedProofKit<Brand, Schema, z.output<Schema> & Patch>;
};

/**
 * Kit from **`branded.proof(brand, schema)`** (after an optional **`refineType`**) or **`refineType`**:
 * Zod-backed nominal guarantee for values assignable to **`z.input<Schema>`**.
 *
 * **`parse`** / **`safeParse`** always take **`T extends z.input<Schema>`** (shape entity, value already
 * narrowed by prior proofs, etc.) and return **`T & Branded<Brand, Out>`** — no “wide” overload that
 * drops **`T`**, so chains (**`pipe`**, repeated **`parse`**) accumulate patches and nominal brands in
 * the type. **`Out`** is **`z.output<Schema>`**, optionally narrowed by **`refineType`**.
 */
export interface BrandedProofKit<
  Brand extends string,
  Schema extends z.ZodType,
  Out = z.output<Schema>,
> {
  readonly brand: Brand;
  schema: Schema;
  parse: <const T extends z.input<Schema>>(input: T) => T & Branded<Brand, Out>;
  safeParse: <const T extends z.input<Schema>>(
    input: T
  ) => { success: true; data: T & Branded<Brand, Out> } | { success: false; error: z.ZodError };
  is: (value: unknown) => value is Branded<Brand, Out>;
}

/**
 * Kit produced by **`branded.proofChain(firstProof).with(…).build()`**: runs each proof in sequence
 * (**`parse`** / **`safeParse`** / **`is`**). Does not expose **`create`** from raw input (use a shape + **`parse`**).
 *
 * **`I`** is the first schema’s input; **`O`** is approximated as **`unknown`** — for a typed output,
 * use the last proof or a local assertion.
 */
export interface CombinedProofKit<I = unknown, O = unknown> {
  readonly brands: readonly string[];
  readonly schemas: readonly z.ZodType[];
  parse: <const T extends I>(input: T) => O;
  safeParse: <const T extends I>(
    input: T
  ) => { success: true; data: O } | { success: false; error: z.ZodError };
  is: (value: unknown) => boolean;
}

/**
 * Any proof returned by **`branded.proof`** (builder or kit after **`refineType`**), suitable for **`proofChain`**.
 */
export type BrandedProofChainable<
  Brand extends string = string,
  Schema extends z.ZodType = z.ZodType,
> = BrandedProofBuilder<Brand, Schema> | BrandedProofKit<Brand, Schema, unknown>;

/**
 * Fluent builder from **`branded.proofChain(firstProof)`**: requires at least **two** proofs in total before **`build()`**.
 */
export interface BrandedProofCombineBuilder<I0> {
  with(next: BrandedProofChainable): BrandedProofCombineBuilder<I0>;
  build(): CombinedProofKit<I0, unknown>;
}
