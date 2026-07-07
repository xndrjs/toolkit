import path from "node:path";
import {
  GENERATED_FILE_BANNER,
  toImportIdentifier,
  toImportPath,
  toModuleBasename,
  toRelativeModuleImport,
} from "../paths.js";
import type { ImportExtension, NamespaceEntry } from "../types.js";

export interface DictionaryFileOptions {
  isSingle: boolean;
  hasLazy: boolean;
  entries: NamespaceEntry[];
  eagerEntries: NamespaceEntry[];
  projectRoot: string;
  dictionaryOutputPath: string;
  typesOutputPath: string;
  schemaTypeName: string;
  importExtension: ImportExtension;
}

export function formatDictionaryFile(options: DictionaryFileOptions): string {
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
      `export const dictionary: ${schemaTypeName} = ${importId};\n`
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
    `export const dictionary: ${dictionaryTypeName} = {\n${objectEntries}\n};\n`
  );
}
