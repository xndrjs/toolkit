import type { z } from "zod";

interface ZodDef {
  type: string;
  shape?: Record<string, z.ZodType>;
  catchall?: z.ZodType;
  element?: z.ZodType;
  keyType?: z.ZodType;
  valueType?: z.ZodType;
  innerType?: z.ZodType;
  entries?: Record<string, string>;
  values?: unknown[];
  options?: z.ZodType[];
  format?: string;
  check?: string;
  checks?: unknown[];
}

function getDef(schema: z.ZodType): ZodDef {
  const internal = schema as z.ZodType & { _zod?: { def: ZodDef }; def?: ZodDef };
  return internal._zod?.def ?? internal.def ?? { type: "unknown" };
}

function getCheckDef(check: unknown): Record<string, unknown> | undefined {
  const internal = check as { _zod?: { def: Record<string, unknown> } };
  return internal._zod?.def;
}

function serializeRegex(pattern: RegExp): string {
  const flags = pattern.flags ? `, ${JSON.stringify(pattern.flags)}` : "";
  return `new RegExp(${JSON.stringify(pattern.source)}${flags})`;
}

function appendStringChecks(source: string, checks: unknown[] | undefined): string {
  if (!checks?.length) {
    return source;
  }

  let result = source;
  for (const check of checks) {
    const def = getCheckDef(check);
    if (!def) {
      continue;
    }

    switch (def.check) {
      case "min_length":
        result += `.min(${JSON.stringify(def.minimum)})`;
        break;
      case "max_length":
        result += `.max(${JSON.stringify(def.maximum)})`;
        break;
      case "string_format":
        if (def.format === "regex" && def.pattern instanceof RegExp) {
          result += `.regex(${serializeRegex(def.pattern)})`;
        }
        break;
      default:
        break;
    }
  }

  return result;
}

function appendNumberChecks(source: string, checks: unknown[] | undefined): string {
  if (!checks?.length) {
    return source;
  }

  let result = source;
  let hasInt = false;

  for (const check of checks) {
    const def = getCheckDef(check);
    if (!def) {
      continue;
    }

    if (def.check === "number_format" && def.format === "safeint") {
      hasInt = true;
      continue;
    }

    if (def.check === "greater_than") {
      const method = def.inclusive ? "min" : "gt";
      result += `.${method}(${JSON.stringify(def.value)})`;
      continue;
    }

    if (def.check === "less_than") {
      const method = def.inclusive ? "max" : "lt";
      result += `.${method}(${JSON.stringify(def.value)})`;
    }
  }

  if (hasInt && !result.includes(".int(")) {
    result = `${source}.int()` + result.slice(source.length);
  }

  return result;
}

function appendArrayChecks(source: string, checks: unknown[] | undefined): string {
  if (!checks?.length) {
    return source;
  }

  let result = source;
  for (const check of checks) {
    const def = getCheckDef(check);
    if (!def) {
      continue;
    }

    if (def.check === "min_length") {
      result += `.min(${JSON.stringify(def.minimum)})`;
    } else if (def.check === "max_length") {
      result += `.max(${JSON.stringify(def.maximum)})`;
    }
  }

  return result;
}

function serializeEnumEntries(entries: Record<string, string>): string {
  const values = Object.values(entries);
  if (values.length === 0) {
    throw new Error("Cannot serialize empty z.enum");
  }

  const serialized = values.map((value) => JSON.stringify(value)).join(", ");
  return `z.enum([${serialized}])`;
}

function serializeUnionMembers(members: z.ZodType[]): string {
  if (members.length === 0) {
    throw new Error("Cannot serialize z.union without members");
  }

  const serialized = members.map((member) => zodToSource(member)).join(", ");
  return `z.union([${serialized}])`;
}

function serializeObjectShape(shape: Record<string, z.ZodType>, loose: boolean): string {
  const entries = Object.entries(shape)
    .map(([key, value]) => `${JSON.stringify(key)}: ${zodToSource(value)}`)
    .join(", ");

  return loose ? `z.looseObject({ ${entries} })` : `z.object({ ${entries} })`;
}

/** Serialize a Zod schema to a TypeScript expression using the `z` identifier. */
export function zodToSource(schema: z.ZodType, sourceSuffix = ""): string {
  const def = getDef(schema);

  switch (def.type) {
    case "string": {
      if (def.format === "datetime" && def.check === "string_format") {
        return appendStringChecks("z.iso.datetime()", def.checks) + sourceSuffix;
      }
      return appendStringChecks("z.string()", def.checks) + sourceSuffix;
    }
    case "number":
      return appendNumberChecks("z.number()", def.checks) + sourceSuffix;
    case "boolean":
      return `z.boolean()${sourceSuffix}`;
    case "unknown":
      return `z.unknown()${sourceSuffix}`;
    case "literal": {
      const value = def.values?.[0];
      return `z.literal(${JSON.stringify(value)})${sourceSuffix}`;
    }
    case "enum":
      if (!def.entries) {
        throw new Error("Cannot serialize z.enum without entries");
      }
      return `${serializeEnumEntries(def.entries)}${sourceSuffix}`;
    case "union": {
      const members = def.options ?? (def.values as z.ZodType[] | undefined);
      if (!members?.length) {
        throw new Error("Cannot serialize z.union without members");
      }
      return `${serializeUnionMembers(members)}${sourceSuffix}`;
    }
    case "array":
      if (!def.element) {
        throw new Error("Cannot serialize z.array without element schema");
      }
      return appendArrayChecks(`z.array(${zodToSource(def.element)})`, def.checks) + sourceSuffix;
    case "record": {
      const key = def.keyType ? zodToSource(def.keyType) : "z.string()";
      const value = def.valueType ? zodToSource(def.valueType) : "z.unknown()";
      return `z.record(${key}, ${value})${sourceSuffix}`;
    }
    case "object": {
      const shape = def.shape ?? {};
      const loose = def.catchall !== undefined;
      return serializeObjectShape(shape, loose) + sourceSuffix;
    }
    case "optional":
      if (!def.innerType) {
        throw new Error("Cannot serialize z.optional without inner type");
      }
      return zodToSource(def.innerType, ".optional()");
    default:
      throw new Error(`Unsupported Zod type for serialization: ${def.type}`);
  }
}
