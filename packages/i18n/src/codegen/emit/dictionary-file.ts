import path from "node:path";
import {
  GENERATED_FILE_BANNER,
  toImportIdentifier,
  toImportPath,
  toLocaleObjectKey,
  toModuleBasename,
  toRelativeModuleImport,
} from "../paths.js";
import type { DeliveryMode } from "../codegen-config-schema.js";
import type { ImportExtension, NamespaceEntry } from "../types.js";

/**
 * Emits the generated `dictionary.generated.ts` module: eager translation imports
 * wired into `defaultDictionary` or `defaultDictionaryFor`, depending on delivery mode.
 */
export interface DictionaryFileOptions {
  isSingle: boolean;
  hasLazy: boolean;
  entries: NamespaceEntry[];
  eagerEntries: NamespaceEntry[];
  projectRoot: string;
  dictionaryOutputPath: string;
  typesOutputPath: string;
  schemaTypeName: string;
  localeTypeName: string;
  importExtension: ImportExtension;
  delivery?: DeliveryMode;
  splitPathsByNamespace?: Record<string, Record<string, string>>;
  requestLocales?: readonly string[];
  deliveryAreaTypeName?: string;
  deliveryAreaNames?: readonly string[];
}

function toArtifactIdentifierSuffix(artifactKey: string): string {
  return artifactKey
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function toSplitImportIdentifier(namespace: string, artifactKey: string): string {
  const namespaceId = toImportIdentifier(namespace).replace(/Ns$/, "");
  return `${namespaceId}${toArtifactIdentifierSuffix(artifactKey)}`;
}

function toNamespaceBaseIdentifier(namespace: string): string {
  return toImportIdentifier(namespace).replace(/Ns$/, "");
}

interface PartitionedDictionaryParams {
  partitionKeys: readonly string[];
  paramName: string;
  paramTypeName: string;
}

function toPartitionSuffix(paramName: string): string {
  return `By${paramName.charAt(0).toUpperCase()}${paramName.slice(1)}`;
}

/**
 * Emits dictionary source for split-by-locale and custom delivery.
 * Imports one JSON file per namespace × partition key (locale or area) and
 * exposes `defaultDictionaryFor(partition)` that selects the matching slice.
 */
function formatPartitionedDictionaryFile(
  options: DictionaryFileOptions,
  { partitionKeys, paramName, paramTypeName }: PartitionedDictionaryParams
): string {
  const {
    isSingle,
    hasLazy,
    eagerEntries,
    projectRoot,
    dictionaryOutputPath,
    typesOutputPath,
    schemaTypeName,
    importExtension,
    splitPathsByNamespace = {},
  } = options;

  const partitionSuffix = toPartitionSuffix(paramName);
  const typesModule = toModuleBasename(typesOutputPath);
  const typesImport = toRelativeModuleImport(typesModule, importExtension);
  const dictionaryTypeName = hasLazy ? "InitialSchema" : schemaTypeName;
  const schemaTypeImport = hasLazy ? `, ${schemaTypeName}` : "";

  const imports = eagerEntries
    .flatMap((entry) =>
      partitionKeys.map((partitionKey) => {
        const splitRelativePath = splitPathsByNamespace[entry.namespace]?.[partitionKey];
        if (!splitRelativePath) {
          throw new Error(
            `[Codegen Error] Missing split path for namespace "${entry.namespace}", ${paramName} "${partitionKey}".`
          );
        }
        const importPath = toImportPath(
          dictionaryOutputPath,
          path.resolve(projectRoot, splitRelativePath)
        );
        const importId = toSplitImportIdentifier(entry.namespace, partitionKey);
        return `import ${importId} from '${importPath}.json';`;
      })
    )
    .join("\n");

  if (isSingle) {
    const entry = eagerEntries[0]!;
    const baseId = toNamespaceBaseIdentifier(entry.namespace);
    const partitionEntries = partitionKeys
      .map(
        (partitionKey) =>
          `  ${toLocaleObjectKey(partitionKey)}: ${toSplitImportIdentifier(entry.namespace, partitionKey)},`
      )
      .join("\n");

    return (
      `${GENERATED_FILE_BANNER}` +
      `${imports}\n` +
      `import type { ${schemaTypeName}, ${paramTypeName} } from '${typesImport}';\n\n` +
      `const ${baseId}${partitionSuffix} = {\n${partitionEntries}\n} as const;\n\n` +
      `export function defaultDictionaryFor(${paramName}: ${paramTypeName}): ${schemaTypeName} {\n` +
      `  return ${baseId}${partitionSuffix}[${paramName}];\n` +
      `}\n`
    );
  }

  const byPartitionBlocks = eagerEntries
    .map((entry) => {
      const baseId = toNamespaceBaseIdentifier(entry.namespace);
      const partitionEntries = partitionKeys
        .map(
          (partitionKey) =>
            `  ${toLocaleObjectKey(partitionKey)}: ${toSplitImportIdentifier(entry.namespace, partitionKey)},`
        )
        .join("\n");
      return `const ${baseId}${partitionSuffix} = {\n${partitionEntries}\n} as const;`;
    })
    .join("\n\n");

  const objectEntries = eagerEntries
    .map((entry) => {
      const baseId = toNamespaceBaseIdentifier(entry.namespace);
      return `    ${entry.namespace}: ${baseId}${partitionSuffix}[${paramName}],`;
    })
    .join("\n");

  const importsBlock = imports.length > 0 ? `${imports}\n` : "";
  const byPartitionBlock = byPartitionBlocks.length > 0 ? `${byPartitionBlocks}\n\n` : "";

  return (
    `${GENERATED_FILE_BANNER}` +
    `${importsBlock}` +
    `import type { ${dictionaryTypeName}, ${paramTypeName}${schemaTypeImport} } from '${typesImport}';\n\n` +
    `${byPartitionBlock}` +
    `export function defaultDictionaryFor(${paramName}: ${paramTypeName}): ${dictionaryTypeName} {\n` +
    `  return {\n${objectEntries}\n  };\n` +
    `}\n`
  );
}

/**
 * Builds `dictionary.generated.ts` for the configured delivery mode:
 * canonical (single bundled JSON per namespace), split-by-locale, or custom areas.
 */
export function formatDictionaryFile(options: DictionaryFileOptions): string {
  const delivery = options.delivery ?? "canonical";
  if (delivery === "split-by-locale") {
    return formatPartitionedDictionaryFile(options, {
      partitionKeys: options.requestLocales ?? [],
      paramName: "locale",
      paramTypeName: options.localeTypeName,
    });
  }
  if (delivery === "custom") {
    if (!options.deliveryAreaTypeName) {
      throw new Error("[Codegen Error] deliveryAreaTypeName is required for custom delivery.");
    }
    return formatPartitionedDictionaryFile(options, {
      partitionKeys: options.deliveryAreaNames ?? [],
      paramName: "area",
      paramTypeName: options.deliveryAreaTypeName,
    });
  }

  const {
    isSingle,
    hasLazy,
    entries,
    eagerEntries,
    projectRoot,
    dictionaryOutputPath,
    typesOutputPath,
    schemaTypeName,
    importExtension,
  } = options;

  const typesModule = toModuleBasename(typesOutputPath);
  const typesImport = toRelativeModuleImport(typesModule, importExtension);

  if (isSingle) {
    const entry = entries[0]!;
    const importPath = toImportPath(
      dictionaryOutputPath,
      path.resolve(projectRoot, entry.filePath)
    );
    const importId = toImportIdentifier(entry.namespace);

    return (
      `${GENERATED_FILE_BANNER}` +
      `import ${importId} from '${importPath}.json';\n` +
      `import type { ${schemaTypeName} } from '${typesImport}';\n\n` +
      `export const defaultDictionary: ${schemaTypeName} = ${importId};\n`
    );
  }

  const dictionaryTypeName = hasLazy ? "InitialSchema" : schemaTypeName;

  const imports = eagerEntries
    .map((entry) => {
      const importPath = toImportPath(
        dictionaryOutputPath,
        path.resolve(projectRoot, entry.filePath)
      );
      return `import ${toImportIdentifier(entry.namespace)} from '${importPath}.json';`;
    })
    .join("\n");

  const objectEntries = eagerEntries
    .map((entry) => `  ${entry.namespace}: ${toImportIdentifier(entry.namespace)},`)
    .join("\n");

  return (
    `${GENERATED_FILE_BANNER}` +
    `${imports}\n` +
    `import type { ${dictionaryTypeName} } from '${typesImport}';\n\n` +
    `export const defaultDictionary: ${dictionaryTypeName} = {\n${objectEntries}\n};\n`
  );
}
