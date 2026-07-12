import type { VariableSpec } from "../../icu/extract-variables.js";
import { GENERATED_FILE_BANNER, toRelativeModuleImport } from "../paths.js";
import type { ImportExtension, NamespaceEntry } from "../types.js";

function formatVariableSpecObject(spec: VariableSpec): string {
  const entries = Object.entries(spec);
  if (entries.length === 0) {
    return "{}";
  }

  const lines = entries.map(
    ([name, type]) => `      ${JSON.stringify(name)}: ${JSON.stringify(type)},`
  );
  return `{\n${lines.join("\n")}\n    }`;
}

/** Builds the `DICTIONARY_SPEC` constant from ICU analysis output (keys + variable args). */
export function formatDictionarySpecBlock(
  isSingle: boolean,
  entries: NamespaceEntry[],
  argsSpecByNamespace: Record<string, Record<string, VariableSpec>>
): string {
  if (isSingle) {
    const onlyNamespace = entries[0]!.namespace;
    const argsByKey = argsSpecByNamespace[onlyNamespace] ?? {};
    const requiredKeys = Object.keys(argsByKey)
      .map((key) => JSON.stringify(key))
      .join(", ");
    const argsLines = Object.entries(argsByKey)
      .map(([key, spec]) => `    ${JSON.stringify(key)}: ${formatVariableSpecObject(spec)},`)
      .join("\n");

    return (
      `export const DICTIONARY_SPEC = {\n` +
      `  mode: 'single' as const,\n` +
      `  requiredKeys: [${requiredKeys}] as const,\n` +
      `  argsByKey: {\n${argsLines}\n  },\n` +
      `} satisfies DictionarySpec;\n`
    );
  }

  const requiredKeysLines = entries
    .map((entry) => {
      const keys = Object.keys(argsSpecByNamespace[entry.namespace] ?? {})
        .map((key) => JSON.stringify(key))
        .join(", ");
      return `    ${JSON.stringify(entry.namespace)}: [${keys}] as const,`;
    })
    .join("\n");

  const argsByKeyLines = entries
    .map((entry) => {
      const argsByKey = argsSpecByNamespace[entry.namespace] ?? {};
      const keyLines = Object.entries(argsByKey)
        .map(([key, spec]) => `      ${JSON.stringify(key)}: ${formatVariableSpecObject(spec)},`)
        .join("\n");
      return `    ${JSON.stringify(entry.namespace)}: {\n${keyLines}\n    },`;
    })
    .join("\n");

  return (
    `export const DICTIONARY_SPEC = {\n` +
    `  mode: 'multi' as const,\n` +
    `  requiredKeys: {\n${requiredKeysLines}\n  },\n` +
    `  argsByKey: {\n${argsByKeyLines}\n  },\n` +
    `} satisfies DictionarySpec;\n`
  );
}

/**
 * Emits the optional dictionary-schema module: `DICTIONARY_SPEC` plus thin wrappers
 * around `@xndrjs/i18n/validation` for external dictionary ingestion.
 */
export function formatDictionarySchemaFile(
  schemaTypeName: string,
  typesModule: string,
  isSingle: boolean,
  dictionarySpecBlock: string,
  importExtension: ImportExtension
): string {
  const typesImport = toRelativeModuleImport(typesModule, importExtension);
  const namespaceImport = isSingle
    ? ""
    : `  validateExternalNamespace as validateExternalNamespaceCore,\n`;
  const namespaceValidator = isSingle
    ? ""
    : `export function validateExternalNamespace<NS extends keyof ${schemaTypeName}>(\n` +
      `  namespace: NS,\n` +
      `  input: unknown,\n` +
      `) {\n` +
      `  return validateExternalNamespaceCore<${schemaTypeName}[NS]>(\n` +
      `    namespace as string,\n` +
      `    input,\n` +
      `    DICTIONARY_SPEC,\n` +
      `  );\n` +
      `}\n\n`;

  return (
    `${GENERATED_FILE_BANNER}` +
    `import {\n` +
    `  normalizeDictionary,\n` +
    `  validateNormalizedDictionary,\n` +
    namespaceImport +
    `  toDictionary,\n` +
    `  type DictionarySpec,\n` +
    `  type NormalizedDictionary,\n` +
    `  type ValidationResult,\n` +
    `} from '@xndrjs/i18n/validation';\n` +
    `import type { ${schemaTypeName} } from '${typesImport}';\n\n` +
    `${dictionarySpecBlock}\n` +
    `export function normalizeExternalDictionary(\n` +
    `  input: unknown,\n` +
    `): ValidationResult<NormalizedDictionary> {\n` +
    `  return normalizeDictionary(input, DICTIONARY_SPEC);\n` +
    `}\n\n` +
    `export function validateNormalizedExternalDictionary(\n` +
    `  normalized: NormalizedDictionary,\n` +
    `): ValidationResult<NormalizedDictionary> {\n` +
    `  return validateNormalizedDictionary(normalized, DICTIONARY_SPEC);\n` +
    `}\n\n` +
    `export function validateExternalDictionary(\n` +
    `  input: unknown,\n` +
    `): ValidationResult<${schemaTypeName}> {\n` +
    `  const step1 = normalizeExternalDictionary(input);\n` +
    `  if (!step1.ok) {\n` +
    `    return step1;\n` +
    `  }\n\n` +
    `  const step2 = validateNormalizedExternalDictionary(step1.data);\n` +
    `  if (!step2.ok) {\n` +
    `    return step2;\n` +
    `  }\n\n` +
    `  return { ok: true, data: toDictionary(step2.data) as ${schemaTypeName} };\n` +
    `}\n\n` +
    namespaceValidator
  );
}
