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
  entries: NamespaceEntry[],
  argsSpecByNamespace: Record<string, Record<string, VariableSpec>>
): string {
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
 * around `@xndrjs/i18n/validation` for validating external payloads before
 * updating authoring / `regenerateNamespaces` (e.g. CMS → authoring JSON), not for runtime key patches.
 */
export function formatDictionarySchemaFile(
  schemaTypeName: string,
  typesModule: string,
  dictionarySpecBlock: string,
  importExtension: ImportExtension
): string {
  const typesImport = toRelativeModuleImport(typesModule, importExtension);
  const partialImport =
    `  validateExternalDictionaryPartial as validateExternalDictionaryPartialCore,\n` +
    `  validateExternalNamespacePartial as validateExternalNamespacePartialCore,\n` +
    `  validateExternalKey as validateExternalKeyCore,\n`;

  const multiValidators =
    `export function validateExternalNamespacePartial<NS extends keyof ${schemaTypeName}>(\n` +
    `  namespace: NS,\n` +
    `  input: unknown,\n` +
    `): ValidationResult<Partial<${schemaTypeName}[NS]>> {\n` +
    `  return validateExternalNamespacePartialCore<Partial<${schemaTypeName}[NS]>>(\n` +
    `    namespace as string,\n` +
    `    input,\n` +
    `    DICTIONARY_SPEC,\n` +
    `  );\n` +
    `}\n\n` +
    `export function validateExternalKey<\n` +
    `  NS extends keyof ${schemaTypeName},\n` +
    `  K extends keyof ${schemaTypeName}[NS],\n` +
    `>(\n` +
    `  namespace: NS,\n` +
    `  key: K,\n` +
    `  input: unknown,\n` +
    `): ValidationResult<Pick<${schemaTypeName}[NS], K>> {\n` +
    `  return validateExternalKeyCore<Pick<${schemaTypeName}[NS], K>>(\n` +
    `    namespace as string,\n` +
    `    key as string,\n` +
    `    input,\n` +
    `    DICTIONARY_SPEC,\n` +
    `  );\n` +
    `}\n\n`;

  return (
    `${GENERATED_FILE_BANNER}` +
    `import {\n` +
    partialImport +
    `  type DictionarySpec,\n` +
    `  type ValidationResult,\n` +
    `} from '@xndrjs/i18n/validation';\n` +
    `import type { ${schemaTypeName} } from '${typesImport}';\n\n` +
    `${dictionarySpecBlock}\n` +
    `export function validateExternalDictionaryPartial(\n` +
    `  input: unknown,\n` +
    `): ValidationResult<Partial<${schemaTypeName}>> {\n` +
    `  return validateExternalDictionaryPartialCore<Partial<${schemaTypeName}>>(\n` +
    `    input,\n` +
    `    DICTIONARY_SPEC,\n` +
    `  );\n` +
    `}\n\n` +
    multiValidators
  );
}
