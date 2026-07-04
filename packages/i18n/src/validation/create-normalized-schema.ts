import { z } from "zod";
import type { VariableSpec } from "../icu/extract-variables.js";
import { createArgsSchema, variableTypeSchema } from "./create-args-schema.js";
import type { DictionarySpec, NormalizedDictionary, ParsedKeyEntry } from "./types.js";

const parsedLocaleEntrySchema = z.object({
  template: z.string(),
  args: z.record(z.string(), variableTypeSchema),
});

const parsedKeyEntrySchema = z.object({
  locales: z.record(z.string(), parsedLocaleEntrySchema),
  mergedArgs: z.record(z.string(), variableTypeSchema),
});

function createKeyDictionarySchema(
  argsByKey: Readonly<Record<string, VariableSpec>>
): z.ZodType<Record<string, ParsedKeyEntry>> {
  const keySchemas = Object.fromEntries(
    Object.entries(argsByKey).map(([key, expectedArgs]) => [
      key,
      parsedKeyEntrySchema.extend({
        mergedArgs: createArgsSchema(expectedArgs),
      }),
    ])
  );

  return z.object(keySchemas);
}

export function createNormalizedDictionarySchema(
  spec: DictionarySpec
): z.ZodType<NormalizedDictionary> {
  if (spec.mode === "single") {
    return z.object({
      mode: z.literal("single"),
      keys: createKeyDictionarySchema(spec.argsByKey),
    }) as z.ZodType<NormalizedDictionary>;
  }

  const namespaceSchemas = Object.fromEntries(
    Object.entries(spec.argsByKey).map(([namespace, argsByKey]) => [
      namespace,
      createKeyDictionarySchema(argsByKey),
    ])
  );

  return z.object({
    mode: z.literal("multi"),
    namespaces: z.object(namespaceSchemas),
  }) as z.ZodType<NormalizedDictionary>;
}
