import { createAri } from "./create-ari";
import { assertValidAriType } from "./format-ari-string";
import {
  safeParse as parseKeySchema,
  type InferKeySchema,
  type KeySchemaIssue,
  type KeySchemaParseResult,
  type ObjectSchema,
} from "./key-schema";
import { formatKeySchemaIssues, safeParseAriString } from "./parse-ari-string";
import type { AddressableResourceIdentifier, AddressableResourceKey } from "./types";

/** Identity schema produced by {@link ari} (exactly one flat object schema). */
export type AriKeySchema = ObjectSchema;

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
  Key extends AddressableResourceKey = AddressableResourceKey,
  KeySchema extends AriKeySchema = AriKeySchema,
> = {
  (key: Key): AddressableResourceIdentifier<Type, Key>;
  readonly type: Type;
  readonly keySchema: KeySchema;
  matches(
    candidate: AddressableResourceIdentifier
  ): candidate is AddressableResourceIdentifier<Type, Key>;
  parseString(formatted: string): AddressableResourceIdentifier<Type, Key>;
  safeParseString(
    formatted: string
  ): KeySchemaParseResult<AddressableResourceIdentifier<Type, Key>>;
};

type ObjectKey<Schema extends ObjectSchema> =
  InferKeySchema<Schema> extends infer Mapped extends AddressableResourceKey
    ? Mapped
    : AddressableResourceKey;

/**
 * Define a typed ARI factory for one resource family.
 *
 * Requires exactly one flat object identity schema:
 * `ari("x", s.object({ id: s.string() }))` → key `{ id }`.
 */
export function ari<const Type extends string, const Schema extends ObjectSchema>(
  type: Type,
  identitySchema: Schema
): AriFactory<Type, ObjectKey<Schema>, Schema> {
  assertValidAriType(type);

  const keySchema = identitySchema;

  function create(key: AddressableResourceKey) {
    const parsed = parseKeySchema(keySchema, key);
    if (!parsed.success) {
      throw new AriKeySchemaError(parsed.issues);
    }

    return createAri(type, parsed.value as AddressableResourceKey);
  }

  function matches(
    candidate: AddressableResourceIdentifier
  ): candidate is AddressableResourceIdentifier {
    return candidate.type === type && parseKeySchema(keySchema, candidate.key).success;
  }

  function safeParseString(formatted: string): KeySchemaParseResult<AddressableResourceIdentifier> {
    const wire = safeParseAriString(formatted);
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
      value: createAri(type, parsed.value as AddressableResourceKey),
    };
  }

  function parseString(formatted: string): AddressableResourceIdentifier {
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
  }) as unknown as AriFactory<Type, ObjectKey<Schema>, Schema>;
}
