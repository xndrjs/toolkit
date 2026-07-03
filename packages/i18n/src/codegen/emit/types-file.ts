import path from "node:path";
import { formatLocaleFallbackBlock } from "../locale-fallback.js";
import { GENERATED_FILE_BANNER, toImportPath } from "../paths.js";
import type { NamespaceEntry } from "../types.js";

export function formatLazyTypesBlock(
  loadOnInitSet: Set<string>,
  lazyEntries: NamespaceEntry[],
  schemaTypeName: string
): string {
  const loadOnInitUnion = [...loadOnInitSet]
    .sort()
    .map((namespace) => `'${namespace}'`)
    .join(" | ");
  const lazyUnion = lazyEntries.map((entry) => `'${entry.namespace}'`).join(" | ");

  return (
    `export type LoadOnInitNamespace = ${loadOnInitUnion};\n` +
    `export type LazyNamespace = ${lazyUnion};\n` +
    `export type InitialSchema = Pick<${schemaTypeName}, LoadOnInitNamespace>;\n\n`
  );
}

export interface TypesFileOptions {
  isSingle: boolean;
  entries: NamespaceEntry[];
  projectRoot: string;
  typesOutputPath: string;
  paramsTypeName: string;
  schemaTypeName: string;
  localeTypeName: string;
  localeFallbackConstName: string;
  localeFallbackTypeName: string;
  localeFallback?: Record<string, string | null> | undefined;
  paramsByNamespace: Record<string, Record<string, string>>;
  requestLocaleUnion: string;
  hasLazy: boolean;
  loadOnInitSet: Set<string>;
  lazyEntries: NamespaceEntry[];
}

export function formatTypesFile(options: TypesFileOptions): string {
  const {
    isSingle,
    entries,
    projectRoot,
    typesOutputPath,
    paramsTypeName,
    schemaTypeName,
    localeTypeName,
    localeFallbackConstName,
    localeFallbackTypeName,
    localeFallback,
    paramsByNamespace,
    requestLocaleUnion,
    hasLazy,
    loadOnInitSet,
    lazyEntries,
  } = options;

  const localeBlock = requestLocaleUnion
    ? `${localeFallback ? formatLocaleFallbackBlock(localeFallback, localeFallbackConstName, localeFallbackTypeName) : ""}` +
      `export type ${localeTypeName} = ${requestLocaleUnion};\n\n`
    : "";

  let paramsBlock: string;
  let schemaBlock: string;

  if (isSingle) {
    const onlyNamespace = entries[0]!.namespace;
    const keyTypes = paramsByNamespace[onlyNamespace] ?? {};
    const paramsLines = Object.entries(keyTypes)
      .map(([key, type]) => `  ${key}: ${type};`)
      .join("\n");

    paramsBlock = `export type ${paramsTypeName} = {\n${paramsLines}\n};`;

    const importPath = toImportPath(
      typesOutputPath,
      path.resolve(projectRoot, entries[0]!.filePath)
    );
    schemaBlock = `export type ${schemaTypeName} = typeof import('${importPath}.json');`;
  } else {
    const namespaceBlocks = entries
      .map((entry) => {
        const keyTypes = paramsByNamespace[entry.namespace] ?? {};
        const lines = Object.entries(keyTypes)
          .map(([key, type]) => `    ${key}: ${type};`)
          .join("\n");
        return `  ${entry.namespace}: {\n${lines}\n  };`;
      })
      .join("\n");

    paramsBlock = `export type ${paramsTypeName} = {\n${namespaceBlocks}\n};`;

    const schemaLines = entries
      .map((entry) => {
        const importPath = toImportPath(typesOutputPath, path.resolve(projectRoot, entry.filePath));
        return `  ${entry.namespace}: typeof import('${importPath}.json');`;
      })
      .join("\n");

    schemaBlock = `export type ${schemaTypeName} = {\n${schemaLines}\n};`;
  }

  const lazyTypesBlock = hasLazy
    ? formatLazyTypesBlock(loadOnInitSet, lazyEntries, schemaTypeName)
    : "";

  return (
    `${GENERATED_FILE_BANNER}` +
    `export const I18N_MODE = '${isSingle ? "single" : "multi"}' as const;\n\n` +
    `${localeBlock}` +
    `${paramsBlock}\n\n` +
    `${schemaBlock}\n` +
    `${lazyTypesBlock}`
  );
}
