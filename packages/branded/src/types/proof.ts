import { z } from "zod";

import { Branded } from "./common";

/**
 * Kit restituito da **`branded.proof(brand, schema)`** con **`refineType`** opzionale.
 *
 * **`refineType<Patch>(guard)`** restringe l'**`Out`** del proof a **`z.output<Schema> & Patch`**
 * (es. **`Patch = { isVerified: true }`**) oltre alla validazione Zod; il guard deve essere coerente
 * con **`Patch`**. Il valore di ritorno è un **`BrandedProofKit`** senza ulteriore **`refineType`**.
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
 * Kit da **`branded.proof(brand, schema)`** (dopo un eventuale **`refineType`**) o **`refineType`**:
 * garanzia nominale Zod su valori compatibili con **`z.input` / `z.output`** — non legato a una shape.
 *
 * **`parse`** / **`safeParse`** preservano il tipo di ingresso **`T`** (es. entità shape) e lo intersecano
 * con **`Branded<Brand, Out>`** per oggetti; i primitivi restano **`Out`** con brand.
 */
export interface BrandedProofKit<
  Brand extends string,
  Schema extends z.ZodType,
  Out = z.output<Schema>,
> {
  readonly brand: Brand;
  schema: Schema;
  parse: {
    <const T extends z.input<Schema>>(input: T): T & Branded<Brand, Out>;
    (input: z.input<Schema>): Branded<Brand, Out>;
  };
  safeParse: {
    <const T extends z.input<Schema>>(
      input: T
    ): { success: true; data: T & Branded<Brand, Out> } | { success: false; error: z.ZodError };
    (
      input: z.input<Schema>
    ): { success: true; data: Branded<Brand, Out> } | { success: false; error: z.ZodError };
  };
  is: (value: unknown) => value is Branded<Brand, Out>;
}

/**
 * Kit prodotto da **`branded.proofChain(firstProof).with(…).build()`**: applica ogni proof in sequenza
 * (**`parse`** / **`safeParse`** / **`is`**). Non espone **`create`** da input grezzo (usare shape + **`parse`**).
 *
 * **`I`** è l'input del primo schema; **`O`** è approssimato come **`unknown`** — per un output tipizzato
 * usare l'ultimo proof o un'asserzione locale.
 */
export interface CombinedProofKit<I = unknown, O = unknown> {
  readonly brands: readonly string[];
  readonly schemas: readonly z.ZodType[];
  parse: {
    <const T extends I>(input: T): O;
    (input: I): O;
  };
  safeParse: {
    <const T extends I>(
      input: T
    ): { success: true; data: O } | { success: false; error: z.ZodError };
    (input: I): { success: true; data: O } | { success: false; error: z.ZodError };
  };
  is: (value: unknown) => boolean;
}

/**
 * Qualsiasi proof restituito da **`branded.proof`** (builder o kit dopo **`refineType`**), accettabile in **`proofChain`**.
 */
export type BrandedProofChainable<
  Brand extends string = string,
  Schema extends z.ZodType = z.ZodType,
> = BrandedProofBuilder<Brand, Schema> | BrandedProofKit<Brand, Schema, unknown>;

/**
 * Builder fluente da **`branded.proofChain(firstProof)`**: richiede almeno **due** proof totali prima di **`build()`**.
 */
export interface BrandedProofCombineBuilder<I0> {
  with(next: BrandedProofChainable): BrandedProofCombineBuilder<I0>;
  build(): CombinedProofKit<I0, unknown>;
}
