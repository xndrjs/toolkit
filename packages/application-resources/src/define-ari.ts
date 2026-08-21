import { ari } from "./ari";
import { safeParse, type KeySchemaIssue, type TupleSchema } from "./key-schema";
import { normalizeKey } from "./normalize-key";
import type { ApplicationResourceIdentifier, ApplicationResourceKey } from "./types";

/** Schemas that describe a full ARI `key` (tuple of parts, or union of those). */
export type AriKeySchema =
  | TupleSchema
  | { readonly kind: "union"; readonly options: readonly TupleSchema[] };

export class AriKeySchemaError extends Error {
  readonly issues: readonly KeySchemaIssue[];

  constructor(issues: readonly KeySchemaIssue[]) {
    super(
      `Invalid ARI key: ${issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ")}`
    );
    this.name = "AriKeySchemaError";
    this.issues = issues;
  }
}

export type DefinedAri<
  Type extends string = string,
  Key extends ApplicationResourceKey = ApplicationResourceKey,
  KeySchema = AriKeySchema,
> = {
  (...keyParts: Key): ApplicationResourceIdentifier<Type, Key>;
  readonly type: Type;
  readonly keySchema: KeySchema;
  matches(
    candidate: ApplicationResourceIdentifier
  ): candidate is ApplicationResourceIdentifier<Type, Key>;
};

type InferLeaf<S> = S extends { readonly kind: "string" }
  ? string
  : S extends { readonly kind: "int" }
    ? number
    : S extends { readonly kind: "boolean" }
      ? boolean
      : S extends { readonly kind: "null" }
        ? null
        : S extends { readonly kind: "literal"; readonly value: infer V }
          ? V
          : S extends {
                readonly kind: "enum";
                readonly values: infer Values extends readonly string[];
              }
            ? Values[number]
            : never;

type InferPart<S> = S extends { readonly kind: "object"; readonly shape: infer Shape }
  ? { readonly [K in keyof Shape]: InferLeaf<Shape[K]> }
  : S extends { readonly kind: "union"; readonly options: readonly (infer Option)[] }
    ? InferPart<Option>
    : InferLeaf<S>;

/** Map tuple item schemas to key part value types (preserves tuple shape). */
type TupleKey<Items extends readonly unknown[]> = {
  readonly [I in keyof Items]: InferPart<Items[I]>;
} extends infer Mapped extends ApplicationResourceKey
  ? Mapped
  : ApplicationResourceKey;

type DefineAriFn = {
  <const Type extends string, const Items extends readonly unknown[]>(
    type: Type,
    keySchema: { readonly kind: "tuple"; readonly items: Items }
  ): DefinedAri<Type, TupleKey<Items>, { readonly kind: "tuple"; readonly items: Items }>;
  <const Type extends string>(
    type: Type,
    keySchema: { readonly kind: "union"; readonly options: readonly TupleSchema[] }
  ): DefinedAri<Type, ApplicationResourceKey, typeof keySchema>;
};

/**
 * Define a typed ARI factory for one locator shape on a resource family.
 *
 * - **create** (`factory(...keyParts)`): normalize + validate key, then build via `ari`
 * - **matches**: `candidate.type === type` and key schema `safeParse` succeeds
 */
export const defineAri: DefineAriFn = ((type: string, keySchema: AriKeySchema) => {
  function create(...keyParts: ApplicationResourceKey) {
    const normalized = normalizeKey(keyParts);
    const parsed = safeParse(keySchema, normalized);
    if (!parsed.success) {
      throw new AriKeySchemaError(parsed.issues);
    }

    return ari(type, ...(parsed.data as ApplicationResourceKey));
  }

  function matches(
    candidate: ApplicationResourceIdentifier
  ): candidate is ApplicationResourceIdentifier {
    return candidate.type === type && safeParse(keySchema, candidate.key).success;
  }

  return Object.assign(create, {
    type,
    keySchema,
    matches,
  });
}) as unknown as DefineAriFn;
