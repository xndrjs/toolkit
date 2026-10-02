import {
  addressableResourceKeySchema,
  safeParse,
  type KeySchemaIssue,
  type KeySchemaParseResult,
} from "./key-schema";
import type { AddressableResourceKey, AddressableResourcePrimitive } from "./types";

export type ParsedAriString = {
  readonly type: string;
  readonly key: AddressableResourceKey;
};

function fail(path: readonly (string | number)[], message: string): KeySchemaParseResult<never> {
  return { success: false, issues: [{ path, message }] };
}

/** Parse one JSON scalar (string / number / boolean / null) starting at `start`. */
function parseJsonScalar(
  input: string,
  start: number
): { readonly value: AddressableResourcePrimitive; readonly end: number } | null {
  if (start >= input.length) {
    return null;
  }

  const ch = input[start]!;

  if (ch === '"') {
    let i = start + 1;
    while (i < input.length) {
      const c = input[i]!;
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === '"') {
        try {
          const value = JSON.parse(input.slice(start, i + 1)) as string;
          return { value, end: i + 1 };
        } catch {
          return null;
        }
      }
      i += 1;
    }
    return null;
  }

  if (input.startsWith("null", start)) {
    return { value: null, end: start + 4 };
  }
  if (input.startsWith("true", start)) {
    return { value: true, end: start + 4 };
  }
  if (input.startsWith("false", start)) {
    return { value: false, end: start + 5 };
  }

  // number: optional minus, digits, optional fraction / exponent (JSON number)
  const numberMatch = input.slice(start).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
  if (numberMatch) {
    const raw = numberMatch[0]!;
    const value = JSON.parse(raw) as number;
    return { value, end: start + raw.length };
  }

  return null;
}

function parseKeyBody(body: string): KeySchemaParseResult<AddressableResourceKey> {
  if (body.length === 0) {
    return { success: true, value: {} };
  }

  const key: Record<string, AddressableResourcePrimitive> = {};
  let i = 0;

  while (i < body.length) {
    const eq = body.indexOf("=", i);
    if (eq === -1 || eq === i) {
      return fail([], "Invalid ARI key field assignment");
    }

    const field = body.slice(i, eq);
    if (field.includes(",") || field.includes("(") || field.includes(")")) {
      return fail([field], "Invalid ARI key field name");
    }

    const parsed = parseJsonScalar(body, eq + 1);
    if (!parsed) {
      return fail([field], "Invalid ARI key field value");
    }

    if (Object.prototype.hasOwnProperty.call(key, field)) {
      return fail([field], "Duplicate ARI key field");
    }

    key[field] = parsed.value;
    i = parsed.end;

    if (i === body.length) {
      break;
    }

    if (body[i] !== ",") {
      return fail([], "Expected ',' between ARI key fields");
    }
    i += 1;
    if (i >= body.length) {
      return fail([], "Trailing comma in ARI key");
    }
  }

  return { success: true, value: key };
}

/** Parses the canonical ARI identity string with structured validation issues. */
export function safeParseAriString(formatted: string): KeySchemaParseResult<ParsedAriString> {
  if (formatted.length === 0) {
    return fail([], "Invalid ARI wire format");
  }

  const open = formatted.indexOf("(");
  if (open === -1 || !formatted.endsWith(")")) {
    return fail([], "Invalid ARI wire format");
  }

  const type = formatted.slice(0, open);
  if (type.length === 0 || type.includes(")") || type.includes("(")) {
    return fail(["type"], "Invalid ARI type segment");
  }

  const body = formatted.slice(open + 1, -1);
  const keyResult = parseKeyBody(body);
  if (!keyResult.success) {
    return keyResult;
  }

  const validated = safeParse(addressableResourceKeySchema, keyResult.value);
  if (!validated.success) {
    return validated as KeySchemaParseResult<ParsedAriString>;
  }

  return {
    success: true,
    value: { type, key: validated.value as AddressableResourceKey },
  };
}

/** Parses the canonical identity string produced by {@link formatAriString}. */
export function parseAriString(formatted: string): ParsedAriString | null {
  const parsed = safeParseAriString(formatted);
  return parsed.success ? parsed.value : null;
}

export function formatKeySchemaIssues(issues: readonly KeySchemaIssue[]): string {
  return issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
}
