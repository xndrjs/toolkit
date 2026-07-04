import { z } from "zod";
import type { VariableSpec, VariableType } from "../icu/extract-variables.js";

export const variableTypeSchema = z.enum(["string", "number", "date"]);

function formatVariableMismatch(expected: VariableSpec, found: VariableSpec): string {
  const expectedKeys = Object.keys(expected).sort();
  const foundKeys = Object.keys(found).sort();
  return `Expected variables [${expectedKeys.join(", ")}], found [${foundKeys.join(", ")}]`;
}

export function createArgsSchema(expected: VariableSpec): z.ZodType<VariableSpec> {
  return z.record(z.string(), variableTypeSchema).superRefine((found, ctx) => {
    const expectedKeys = Object.keys(expected).sort();
    const foundKeys = Object.keys(found).sort();

    if (expectedKeys.join() !== foundKeys.join()) {
      ctx.addIssue({
        code: "custom",
        message: formatVariableMismatch(expected, found),
      });
      return;
    }

    for (const [name, type] of Object.entries(expected)) {
      if (found[name] !== type) {
        ctx.addIssue({
          code: "custom",
          message: `Variable "${name}": expected ${type}, found ${found[name]}`,
        });
      }
    }
  });
}

export function mapArgsSchemaError(
  expected: VariableSpec,
  found: VariableSpec,
  message: string,
  path: readonly string[]
) {
  const expectedKeys = Object.keys(expected).sort();
  const foundKeys = Object.keys(found).sort();

  if (expectedKeys.join() !== foundKeys.join()) {
    return {
      kind: "variable_mismatch" as const,
      path,
      expected,
      found,
      message,
    };
  }

  for (const [name, type] of Object.entries(expected)) {
    const foundType = found[name];
    if (foundType !== undefined && foundType !== type) {
      return {
        kind: "variable_type_mismatch" as const,
        path,
        variable: name,
        expected: type,
        found: foundType as VariableType,
        message,
      };
    }
  }

  return {
    kind: "variable_mismatch" as const,
    path,
    expected,
    found,
    message,
  };
}
