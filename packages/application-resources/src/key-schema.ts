/**
 * Minimal key-schema DSL for Application Resource Identifier coordinates.
 * Covers string/int/boolean/literal/enum/nullable/optional, flat objects, tuples, and unions.
 * Not a general validation library — no refine, transform, or nested objects.
 */

import type { ApplicationResourceKey } from "./types";

export type KeySchemaIssue = {
  readonly path: readonly (string | number)[];
  readonly message: string;
};

export type KeySchemaParseResult<T> =
  | { readonly success: true; readonly value: T }
  | { readonly success: false; readonly issues: readonly KeySchemaIssue[] };

export type StringSchema = { readonly kind: "string" };
export type IntSchema = { readonly kind: "int" };
export type BooleanSchema = { readonly kind: "boolean" };
export type LiteralSchema<V extends string | number | boolean = string | number | boolean> = {
  readonly kind: "literal";
  readonly value: V;
};
export type EnumSchema<Values extends readonly string[] = readonly string[]> = {
  readonly kind: "enum";
  readonly values: Values;
};

/** Non-null leaf schemas (nullable / optional wrap these). */
export type NonNullLeafSchema =
  | StringSchema
  | IntSchema
  | BooleanSchema
  | LiteralSchema
  | EnumSchema;

export type NullableSchema<Inner extends NonNullLeafSchema = NonNullLeafSchema> = {
  readonly kind: "nullable";
  readonly inner: Inner;
};

export type OptionalSchema<Inner extends NonNullLeafSchema = NonNullLeafSchema> = {
  readonly kind: "optional";
  readonly inner: Inner;
};

/** Leaf schemas allowed as values inside flat key objects. */
export type LeafSchema = NonNullLeafSchema | NullableSchema | OptionalSchema;

export type ObjectSchema<Shape extends Record<string, LeafSchema> = Record<string, LeafSchema>> = {
  readonly kind: "object";
  readonly shape: Shape;
};

export type UnionSchema<Options extends readonly unknown[] = readonly unknown[]> = {
  readonly kind: "union";
  readonly options: Options;
};

/** A single key part: leaf, flat object, or union of parts. */
export type KeyPartSchema = LeafSchema | ObjectSchema | UnionSchema<readonly KeyPartSchema[]>;

export type TupleSchema<Items extends readonly KeyPartSchema[] = readonly KeyPartSchema[]> = {
  readonly kind: "tuple";
  readonly items: Items;
};

/** Variable-length ARI key array (transport / wire shape). */
export type WireKeySchema = { readonly kind: "wireKey" };

/** Full key schema: typically a tuple, or a union of locator shapes. */
export type AnyKeySchema =
  | KeyPartSchema
  | TupleSchema
  | UnionSchema<readonly (KeyPartSchema | TupleSchema)[]>
  | WireKeySchema;

type InferNonNullLeafSchema<S> = S extends { readonly kind: "string" }
  ? string
  : S extends { readonly kind: "int" }
    ? number
    : S extends { readonly kind: "boolean" }
      ? boolean
      : S extends { readonly kind: "literal"; readonly value: infer V }
        ? V
        : S extends {
              readonly kind: "enum";
              readonly values: infer Values extends readonly string[];
            }
          ? Values[number]
          : never;

type InferLeafSchema<S> = S extends { readonly kind: "nullable"; readonly inner: infer Inner }
  ? InferNonNullLeafSchema<Inner> | null
  : S extends { readonly kind: "optional"; readonly inner: infer Inner }
    ? InferNonNullLeafSchema<Inner> | undefined
    : InferNonNullLeafSchema<S>;

type OptionalShapeKeys<Shape> = {
  [K in keyof Shape]: Shape[K] extends { readonly kind: "optional" } ? K : never;
}[keyof Shape];

type RequiredShapeKeys<Shape> = Exclude<keyof Shape, OptionalShapeKeys<Shape>>;

type InferObjectSchema<S> = S extends {
  readonly kind: "object";
  readonly shape: infer Shape extends Record<string, unknown>;
}
  ? [OptionalShapeKeys<Shape>] extends [never]
    ? { readonly [K in keyof Shape]: InferLeafSchema<Shape[K]> }
    : Simplify<
        {
          readonly [K in RequiredShapeKeys<Shape>]: InferLeafSchema<Shape[K]>;
        } & {
          readonly [K in OptionalShapeKeys<Shape>]?: InferNonNullLeafSchema<
            Shape[K] extends { readonly inner: infer Inner } ? Inner : never
          >;
        }
      >
  : never;

type InferPartSchema<S> = S extends { readonly kind: "object" }
  ? InferObjectSchema<S>
  : S extends { readonly kind: "union"; readonly options: readonly (infer Option)[] }
    ? InferPartSchema<Option>
    : InferLeafSchema<S>;

type InferTupleSchema<Items extends readonly unknown[]> = Items extends readonly [
  infer Head,
  ...infer Tail,
]
  ? readonly [InferPartSchema<Head>, ...InferTupleSchema<Tail>]
  : readonly [];

type Simplify<T> = { [K in keyof T]: T[K] } & {};

export type InferKeySchema<S> = S extends {
  readonly kind: "tuple";
  readonly items: infer Items extends readonly unknown[];
}
  ? InferTupleSchema<Items>
  : S extends { readonly kind: "union"; readonly options: readonly (infer Option)[] }
    ? InferKeySchema<Option>
    : S extends { readonly kind: "object" }
      ? Simplify<InferObjectSchema<S>>
      : S extends { readonly kind: "wireKey" }
        ? ApplicationResourceKey
        : InferLeafSchema<S>;

function fail(path: readonly (string | number)[], message: string): KeySchemaParseResult<never> {
  return { success: false, issues: [{ path, message }] };
}

function prependPath(
  pathPrefix: readonly (string | number)[],
  issues: readonly KeySchemaIssue[]
): readonly KeySchemaIssue[] {
  return issues.map((issue) => ({
    path: [...pathPrefix, ...issue.path],
    message: issue.message,
  }));
}

function parseNonNullLeaf(
  schema: NonNullLeafSchema,
  input: unknown,
  path: readonly (string | number)[]
): KeySchemaParseResult<string | number | boolean> {
  switch (schema.kind) {
    case "string": {
      if (typeof input !== "string") {
        return fail(path, "Expected string");
      }
      return { success: true, value: input };
    }
    case "int": {
      if (typeof input !== "number" || !Number.isInteger(input) || !Number.isFinite(input)) {
        return fail(path, "Expected finite integer");
      }
      return { success: true, value: input };
    }
    case "boolean": {
      if (typeof input !== "boolean") {
        return fail(path, "Expected boolean");
      }
      return { success: true, value: input };
    }
    case "literal": {
      if (input !== schema.value) {
        return fail(path, `Expected literal ${JSON.stringify(schema.value)}`);
      }
      return { success: true, value: schema.value };
    }
    case "enum": {
      if (typeof input !== "string" || !schema.values.includes(input)) {
        return fail(
          path,
          `Expected one of: ${schema.values.map((v) => JSON.stringify(v)).join(", ")}`
        );
      }
      return { success: true, value: input };
    }
  }
}

function parseLeaf(
  schema: LeafSchema,
  input: unknown,
  path: readonly (string | number)[]
): KeySchemaParseResult<string | number | boolean | null | undefined> {
  switch (schema.kind) {
    case "nullable": {
      if (input === null) {
        return { success: true, value: null };
      }
      return parseNonNullLeaf(schema.inner, input, path);
    }
    case "optional": {
      if (input === undefined) {
        return { success: true, value: undefined };
      }
      return parseNonNullLeaf(schema.inner, input, path);
    }
    default:
      return parseNonNullLeaf(schema, input, path);
  }
}

function parseObject(
  schema: ObjectSchema,
  input: unknown,
  path: readonly (string | number)[]
): KeySchemaParseResult<Record<string, unknown>> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return fail(path, "Expected object");
  }

  const record = input as Record<string, unknown>;
  const shapeKeys = Object.keys(schema.shape);

  for (const key of Object.keys(record)) {
    if (!Object.prototype.hasOwnProperty.call(schema.shape, key)) {
      return fail([...path, key], "Unexpected key");
    }
  }

  const data: Record<string, unknown> = {};
  for (const key of shapeKeys) {
    const fieldSchema = schema.shape[key]!;
    const missing = !Object.prototype.hasOwnProperty.call(record, key);

    if (fieldSchema.kind === "optional" && (missing || record[key] === undefined)) {
      continue;
    }

    if (missing) {
      return fail([...path, key], "Missing key");
    }

    const fieldResult = parseLeaf(fieldSchema, record[key], [...path, key]);
    if (!fieldResult.success) {
      return fieldResult;
    }
    if (fieldResult.value === undefined && fieldSchema.kind === "optional") {
      continue;
    }
    data[key] = fieldResult.value;
  }

  return { success: true, value: data };
}

function parseKeyPart(
  schema: KeyPartSchema,
  input: unknown,
  path: readonly (string | number)[]
): KeySchemaParseResult<unknown> {
  if (schema.kind === "object") {
    return parseObject(schema, input, path);
  }
  if (schema.kind === "union") {
    return parseUnion(schema as UnionSchema<readonly KeyPartSchema[]>, input, path);
  }
  return parseLeaf(schema, input, path);
}

function parseTuple(
  schema: TupleSchema,
  input: unknown,
  path: readonly (string | number)[]
): KeySchemaParseResult<readonly unknown[]> {
  if (!Array.isArray(input)) {
    return fail(path, "Expected array");
  }
  if (input.length !== schema.items.length) {
    return fail(path, `Expected tuple of length ${schema.items.length}`);
  }

  const data: unknown[] = [];
  for (let i = 0; i < schema.items.length; i++) {
    const itemResult = parseKeyPart(schema.items[i]!, input[i], [...path, i]);
    if (!itemResult.success) {
      return itemResult;
    }
    data.push(itemResult.value);
  }

  return { success: true, value: data };
}

function parseUnion(
  schema: UnionSchema,
  input: unknown,
  path: readonly (string | number)[]
): KeySchemaParseResult<unknown> {
  const allIssues: KeySchemaIssue[] = [];

  for (let i = 0; i < schema.options.length; i++) {
    const optionResult = parseAny(schema.options[i] as AnyKeySchema, input, path);
    if (optionResult.success) {
      return optionResult;
    }
    allIssues.push(...prependPath([...path, `union(${i})`], optionResult.issues));
  }

  return {
    success: false,
    issues: allIssues.length > 0 ? allIssues : [{ path, message: "No union option matched" }],
  };
}

function parseWirePrimitive(
  input: unknown,
  path: readonly (string | number)[]
): KeySchemaParseResult<string | number | boolean | null> {
  if (
    input === null ||
    typeof input === "string" ||
    typeof input === "number" ||
    typeof input === "boolean"
  ) {
    return { success: true, value: input };
  }

  return fail(path, "Expected string, number, boolean, or null");
}

function parseWireKeyObject(
  input: unknown,
  path: readonly (string | number)[]
): KeySchemaParseResult<Record<string, string | number | boolean | null>> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return fail(path, "Expected flat object");
  }

  const record = input as Record<string, unknown>;
  const data: Record<string, string | number | boolean | null> = {};

  for (const key of Object.keys(record)) {
    const valueResult = parseWirePrimitive(record[key], [...path, key]);
    if (!valueResult.success) {
      return valueResult;
    }
    data[key] = valueResult.value;
  }

  return { success: true, value: data };
}

function parseWireKeyPart(
  input: unknown,
  path: readonly (string | number)[]
): KeySchemaParseResult<ApplicationResourceKey[number]> {
  const primitiveResult = parseWirePrimitive(input, path);
  if (primitiveResult.success) {
    return primitiveResult;
  }

  return parseWireKeyObject(input, path);
}

function parseWireKey(
  input: unknown,
  path: readonly (string | number)[]
): KeySchemaParseResult<ApplicationResourceKey> {
  if (!Array.isArray(input)) {
    return fail(path, "Expected array");
  }

  const data: ApplicationResourceKey[number][] = [];
  for (let index = 0; index < input.length; index += 1) {
    const partResult = parseWireKeyPart(input[index], [...path, index]);
    if (!partResult.success) {
      return partResult;
    }
    data.push(partResult.value);
  }

  return { success: true, value: data };
}

function parseAny(
  schema: AnyKeySchema,
  input: unknown,
  path: readonly (string | number)[] = []
): KeySchemaParseResult<unknown> {
  switch (schema.kind) {
    case "tuple":
      return parseTuple(schema, input, path);
    case "union":
      return parseUnion(schema, input, path);
    case "object":
      return parseObject(schema, input, path);
    case "wireKey":
      return parseWireKey(input, path);
    default:
      return parseKeyPart(schema, input, path);
  }
}

/** Validate `input` against a key schema. */
export function safeParse(schema: AnyKeySchema, input: unknown): KeySchemaParseResult<unknown> {
  return parseAny(schema, input);
}

/** Schema for the transport shape of any ARI key (`ApplicationResourceKey`). */
export const applicationResourceKeySchema: WireKeySchema = { kind: "wireKey" };

export const s = {
  string(): StringSchema {
    return { kind: "string" };
  },
  int(): IntSchema {
    return { kind: "int" };
  },
  boolean(): BooleanSchema {
    return { kind: "boolean" };
  },
  /** Allow `null` alongside an inner leaf. Key must still be present on objects. */
  nullable<const Inner extends NonNullLeafSchema>(inner: Inner): NullableSchema<Inner> {
    return { kind: "nullable", inner };
  },
  /** Allow missing / `undefined` alongside an inner leaf. Omitted from object output when absent. */
  optional<const Inner extends NonNullLeafSchema>(inner: Inner): OptionalSchema<Inner> {
    return { kind: "optional", inner };
  },
  literal<const V extends string | number | boolean>(value: V): LiteralSchema<V> {
    return { kind: "literal", value };
  },
  enum<const Values extends readonly string[]>(values: Values): EnumSchema<Values> {
    return { kind: "enum", values };
  },
  object<const Shape extends Record<string, LeafSchema>>(shape: Shape): ObjectSchema<Shape> {
    return { kind: "object", shape };
  },
  tuple<const Items extends readonly KeyPartSchema[]>(items: Items): TupleSchema<Items> {
    return { kind: "tuple", items };
  },
  union<const Options extends readonly (KeyPartSchema | TupleSchema)[]>(
    options: Options
  ): UnionSchema<Options> {
    return { kind: "union", options };
  },
  /** Variable-length ARI key array (transport / wire shape). */
  wireKey(): WireKeySchema {
    return applicationResourceKeySchema;
  },
} as const;
