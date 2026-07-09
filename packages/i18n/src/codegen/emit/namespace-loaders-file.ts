import { GENERATED_FILE_BANNER, toImportPath, toRelativeModuleImport } from "../paths.js";
import type { ImportExtension, NamespaceEntry } from "../types.js";

export function formatNamespaceLoadersFile(
  loadersOutputPath: string,
  lazyEntries: (NamespaceEntry & { absolutePath: string })[],
  schemaTypeName: string,
  typesModule: string,
  importExtension: ImportExtension
): string {
  const typesImport = toRelativeModuleImport(typesModule, importExtension);
  const loaderEntries = lazyEntries
    .map((entry) => {
      const importPath = toImportPath(loadersOutputPath, entry.absolutePath);
      return `  ${entry.namespace}: () => import('${importPath}.json').then((m) => m.default),`;
    })
    .join("\n");

  return (
    `${GENERATED_FILE_BANNER}` +
    `import type { ${schemaTypeName}, LazyNamespace } from '${typesImport}';\n\n` +
    `export const namespaceLoaders: {\n` +
    `  [K in LazyNamespace]: () => Promise<${schemaTypeName}[K]>;\n` +
    `} = {\n${loaderEntries}\n};\n`
  );
}
