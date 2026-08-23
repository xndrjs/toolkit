import { createAri } from "./create-ari";
import {
  s,
  safeParse as parseKeySchema,
  type InferKeySchema,
  type KeyPartSchema,
  type KeySchemaIssue,
  type KeySchemaParseResult,
  type TupleSchema,
} from "./key-schema";
import { normalizeKey } from "./normalize-key";
import { formatKeySchemaIssues, safeParseStableStringifyResource } from "./parse-stable-stringify";
import type { ApplicationResourceIdentifier, ApplicationResourceKey } from "./types";

/** Full key schema produced by {@link ari} (parts wrapped in a tuple). */
export type AriKeySchema = TupleSchema;

export class AriKeySchemaError extends Error {
  readonly issues: readonly KeySchemaIssue[];

  constructor(issues: readonly KeySchemaIssue[]) {
    super(`Invalid ARI key: ${formatKeySchemaIssues(issues)}`);
    this.name = "AriKeySchemaError";
    this.issues = issues;
  }
}

export class AriParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AriParseError";
  }
}

export type AriFactory<
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
  parseString(formatted: string): ApplicationResourceIdentifier<Type, Key>;
  safeParseString(
    formatted: string
  ): KeySchemaParseResult<ApplicationResourceIdentifier<Type, Key>>;
};

/** Map key-part schemas to the ARI `key` tuple type. */
type TupleKey<Parts extends readonly unknown[]> =
  InferKeySchema<{
    readonly kind: "tuple";
    readonly items: Parts;
  }> extends infer Mapped extends ApplicationResourceKey
    ? Mapped
    : ApplicationResourceKey;

type AriFn = <const Type extends string, const Parts extends readonly KeyPartSchema[]>(
  type: Type,
  ...parts: Parts
) => AriFactory<Type, TupleKey<Parts>, TupleSchema<Parts>>;

/**
 * Define a typed ARI factory for one resource family.
 *
 * Key part schemas are passed as rest arguments and wrapped in a tuple automatically:
 * `ari("x", s.object({ id: s.string() }))` ≡ key `[{ id }]`.
 */
export const ari: AriFn = ((type: string, ...parts: KeyPartSchema[]) => {
  const keySchema = s.tuple(parts);

  function create(...keyParts: ApplicationResourceKey) {
    const normalized = normalizeKey(keyParts);
    const parsed = parseKeySchema(keySchema, normalized);
    if (!parsed.success) {
      throw new AriKeySchemaError(parsed.issues);
    }

    return createAri(type, ...(parsed.value as ApplicationResourceKey));
  }

  function matches(
    candidate: ApplicationResourceIdentifier
  ): candidate is ApplicationResourceIdentifier {
    return candidate.type === type && parseKeySchema(keySchema, candidate.key).success;
  }

  function safeParseString(formatted: string): KeySchemaParseResult<ApplicationResourceIdentifier> {
    const wire = safeParseStableStringifyResource(formatted);
    if (!wire.success) {
      return wire;
    }

    if (wire.value.type !== type) {
      return {
        success: false,
        issues: [
          {
            path: ["type"],
            message: `Expected ARI type ${JSON.stringify(type)}, got ${JSON.stringify(wire.value.type)}`,
          },
        ],
      };
    }

    const parsed = parseKeySchema(keySchema, wire.value.key);
    if (!parsed.success) {
      return parsed;
    }

    return {
      success: true,
      value: createAri(type, ...(parsed.value as ApplicationResourceKey)),
    };
  }

  function parseString(formatted: string): ApplicationResourceIdentifier {
    const parsed = safeParseString(formatted);
    if (parsed.success) {
      return parsed.value;
    }

    const wireIssues = parsed.issues.filter(
      (issue) => issue.path.length === 0 || issue.path[0] === "type"
    );
    if (wireIssues.length === parsed.issues.length) {
      throw new AriParseError(`Invalid ARI string: ${formatted}`);
    }

    throw new AriKeySchemaError(parsed.issues);
  }

  return Object.assign(create, {
    type,
    keySchema,
    matches,
    parseString,
    safeParseString,
  });
}) as unknown as AriFn;
