import { ari } from "./ari";
import {
  s,
  safeParse,
  type InferKeySchema,
  type KeyPartSchema,
  type KeySchemaIssue,
  type TupleSchema,
} from "./key-schema";
import { normalizeKey } from "./normalize-key";
import type { ApplicationResourceIdentifier, ApplicationResourceKey } from "./types";

/** Full key schema produced by {@link defineAri} (parts wrapped in a tuple). */
export type AriKeySchema = TupleSchema;

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

/** Map key-part schemas to the ARI `key` tuple type. */
type TupleKey<Parts extends readonly unknown[]> =
  InferKeySchema<{
    readonly kind: "tuple";
    readonly items: Parts;
  }> extends infer Mapped extends ApplicationResourceKey
    ? Mapped
    : ApplicationResourceKey;

type DefineAriFn = <const Type extends string, const Parts extends readonly KeyPartSchema[]>(
  type: Type,
  ...parts: Parts
) => DefinedAri<Type, TupleKey<Parts>, TupleSchema<Parts>>;

/**
 * Define a typed ARI factory for one locator shape on a resource family.
 *
 * Key parts are passed as rest schemas and wrapped in a tuple automatically:
 * `defineAri("x", s.object({ id: s.string() }))` ≡ key `[{ id }]`.
 *
 * - **create** (`factory(...keyParts)`): normalize + validate key, then build via `ari`
 * - **matches**: `candidate.type === type` and key schema `safeParse` succeeds
 */
export const defineAri: DefineAriFn = ((type: string, ...parts: KeyPartSchema[]) => {
  const keySchema = s.tuple(parts);

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
