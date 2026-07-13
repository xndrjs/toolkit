import type { ZodError } from "zod";
import { mapArgsSchemaError } from "./create-args-schema.js";
import {
  createKeyDictionarySchema,
  createNormalizedDictionarySchema,
} from "./create-normalized-schema.js";
import type {
  DictionarySpec,
  NormalizedDictionary,
  NormalizedKeyDictionary,
  ValidationIssue,
  ValidationResult,
  VariableSpec,
} from "./types.js";

function getExpectedArgs(spec: DictionarySpec, path: readonly string[]): VariableSpec | undefined {
  if (spec.mode === "single") {
    const key = path[path.length - 1];
    if (typeof key !== "string") {
      return undefined;
    }
    return spec.argsByKey[key];
  }

  const namespace = path[0];
  const key = path[path.length - 1];
  if (typeof namespace !== "string" || typeof key !== "string") {
    return undefined;
  }

  return spec.argsByKey[namespace]?.[key];
}

function getFoundArgs(
  normalized: NormalizedDictionary,
  path: readonly string[]
): VariableSpec | undefined {
  if (normalized.mode === "single") {
    const key = path[path.length - 1];
    if (typeof key !== "string") {
      return undefined;
    }
    return normalized.keys[key]?.mergedArgs;
  }

  const namespace = path[0];
  const key = path[path.length - 1];
  if (typeof namespace !== "string" || typeof key !== "string") {
    return undefined;
  }

  return normalized.namespaces[namespace]?.[key]?.mergedArgs;
}

function mapZodError(
  error: ZodError,
  spec: DictionarySpec,
  normalized: NormalizedDictionary
): ValidationIssue[] {
  return error.issues.map((issue) => {
    const path = issue.path.map(String);

    if (path.includes("mergedArgs")) {
      const keyPath = path.slice(0, path.indexOf("mergedArgs"));
      const expected = getExpectedArgs(spec, keyPath);
      const found = getFoundArgs(normalized, keyPath);

      if (expected && found) {
        return mapArgsSchemaError(expected, found, issue.message, keyPath);
      }
    }

    return {
      kind: "invalid_input" as const,
      message: path.length > 0 ? `${path.join(".")}: ${issue.message}` : issue.message,
    };
  });
}

export function validateNormalizedKeyDictionaryPartial(
  keys: NormalizedKeyDictionary,
  argsByKey: Readonly<Record<string, VariableSpec>>,
  spec: DictionarySpec,
  keyPathPrefix: readonly string[]
): ValidationResult<NormalizedKeyDictionary> {
  const presentKeys = Object.keys(keys);
  const subsetArgsByKey = Object.fromEntries(
    presentKeys.filter((key) => key in argsByKey).map((key) => [key, argsByKey[key]!])
  );

  if (presentKeys.length === 0) {
    return { ok: true, data: keys };
  }

  const schema = createKeyDictionarySchema(subsetArgsByKey);
  const result = schema.safeParse(keys);

  if (result.success) {
    return { ok: true, data: result.data };
  }

  const normalized: NormalizedDictionary =
    spec.mode === "single"
      ? { mode: "single", keys }
      : {
          mode: "multi",
          namespaces: {
            [keyPathPrefix[0] ?? ""]: keys,
          },
        };

  return {
    ok: false,
    issues: mapZodError(result.error, spec, normalized),
  };
}

export function validateNormalizedDictionary(
  normalized: NormalizedDictionary,
  spec: DictionarySpec
): ValidationResult<NormalizedDictionary> {
  const schema = createNormalizedDictionarySchema(spec);
  const result = schema.safeParse(normalized);

  if (result.success) {
    return { ok: true, data: result.data };
  }

  return {
    ok: false,
    issues: mapZodError(result.error, spec, normalized),
  };
}
