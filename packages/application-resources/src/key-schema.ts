/**
 * Minimal key-schema DSL for Application Resource Identifier coordinates.
 * Covers string/int/boolean/null/literal/enum, flat objects, tuples, and unions.
 * Not a general validation library — no refine, transform, or nested objects.
 */

export type KeySchemaIssue = {
  readonly path: readonly (string | number)[];
  readonly message: string;
};

export type KeySchemaParseResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly issues: readonly KeySchemaIssue[] };

export type StringSchema = { readonly kind: "string" };
export type IntSchema = { readonly kind: "int" };
export type BooleanSchema = { readonly kind: "boolean" };
export type NullSchema = { readonly kind: "null" };
export type LiteralSchema<V extends string | number | boolean = string | number | boolean> = {
  readonly kind: "literal";
  readonly value: V;
};
export type EnumSchema<Values extends readonly string[] = readonly string[]> = {
  readonly kind: "enum";
  readonly values: Values;
};

/** Leaf schemas allowed as values inside flat key objects. */
export type LeafSchema =
  | StringSchema
  | IntSchema
  | BooleanSchema
  | NullSchema
  | LiteralSchema
  | EnumSchema;

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

/** Full key schema: typically a tuple, or a union of locator shapes. */
export type AnyKeySchema =
  | KeyPartSchema
  | TupleSchema
  | UnionSchema<readonly (KeyPartSchema | TupleSchema)[]>;

type InferLeafSchema<S> = S extends { readonly kind: "string" }
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

type InferObjectSchema<S> = S extends { readonly kind: "object"; readonly shape: infer Shape }
  ? { readonly [K in keyof Shape]: InferLeafSchema<Shape[K]> }
  : never;

type InferPartSchema<S> = S extends { readonly kind: "object" }
  ? InferObjectSchema<S>
  : S extends { readonly kind: "union"; readonly options: readonly (infer Option)[] }
    ? InferPartSchema<Option>
    : InferLeafSchema<S>;

/** Infer the TypeScript type of values accepted by a key schema. */
export type InferKeySchema<S> = S extends { readonly kind: "tuple"; readonly items: infer Items }
  ? { readonly [I in keyof Items]: InferPartSchema<Items[I]> }
  : S extends { readonly kind: "union"; readonly options: readonly (infer Option)[] }
    ? InferKeySchema<Option>
    : S extends { readonly kind: "object" }
      ? InferObjectSchema<S>
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

function parseLeaf(
  schema: LeafSchema,
  input: unknown,
  path: readonly (string | number)[]
): KeySchemaParseResult<string | number | boolean | null> {
  switch (schema.kind) {
    case "string": {
      if (typeof input !== "string") {
        return fail(path, "Expected string");
      }
      return { success: true, data: input };
    }
    case "int": {
      if (typeof input !== "number" || !Number.isInteger(input) || !Number.isFinite(input)) {
        return fail(path, "Expected finite integer");
      }
      return { success: true, data: input };
    }
    case "boolean": {
      if (typeof input !== "boolean") {
        return fail(path, "Expected boolean");
      }
      return { success: true, data: input };
    }
    case "null": {
      if (input !== null) {
        return fail(path, "Expected null");
      }
      return { success: true, data: null };
    }
    case "literal": {
      if (input !== schema.value) {
        return fail(path, `Expected literal ${JSON.stringify(schema.value)}`);
      }
      return { success: true, data: schema.value };
    }
    case "enum": {
      if (typeof input !== "string" || !schema.values.includes(input)) {
        return fail(
          path,
          `Expected one of: ${schema.values.map((v) => JSON.stringify(v)).join(", ")}`
        );
      }
      return { success: true, data: input };
    }
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
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      return fail([...path, key], "Missing key");
    }
    const fieldResult = parseLeaf(schema.shape[key]!, record[key], [...path, key]);
    if (!fieldResult.success) {
      return fieldResult;
    }
    data[key] = fieldResult.data;
  }

  return { success: true, data };
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
    data.push(itemResult.data);
  }

  return { success: true, data };
}

function parseUnion(
  schema: UnionSchema,
  input: unknown,
  path: readonly (string | number)[]
): KeySchemaParseResult<unknown> {
  const allIssues: KeySchemaIssue[] = [];

  for (let i = 0; i < schema.options.length; i++) {
    const optionResult = parseAny(schema.options[i] as AnyKeySchema, input);
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

function parseAny(schema: AnyKeySchema, input: unknown): KeySchemaParseResult<unknown> {
  const path: readonly (string | number)[] = [];
  switch (schema.kind) {
    case "tuple":
      return parseTuple(schema, input, path);
    case "union":
      return parseUnion(schema, input, path);
    case "object":
      return parseObject(schema, input, path);
    default:
      return parseKeyPart(schema, input, path);
  }
}

/** Validate `input` against a key schema. */
export function safeParse(schema: AnyKeySchema, input: unknown): KeySchemaParseResult<unknown> {
  return parseAny(schema, input);
}

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
  null(): NullSchema {
    return { kind: "null" };
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
} as const;
