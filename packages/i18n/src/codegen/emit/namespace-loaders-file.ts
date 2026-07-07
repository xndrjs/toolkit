import { GENERATED_FILE_BANNER, toImportPath, toRelativeModuleImport } from "../paths.js";
import type { ImportExtension, NamespaceEntry } from "../types.js";

export function formatNamespaceLoadersFile(
  loadersOutputPath: string,
  lazyEntries: (NamespaceEntry & { absolutePath: string })[],
  schemaTypeName: string,
  typesModule: string,
  dictionarySchemaModule: string,
  instanceModule: string,
  factoryName: string,
  importExtension: ImportExtension
): string {
  const dictionarySchemaImport = toRelativeModuleImport(dictionarySchemaModule, importExtension);
  const typesImport = toRelativeModuleImport(typesModule, importExtension);
  const instanceImport = toRelativeModuleImport(instanceModule, importExtension);
  const loaderEntries = lazyEntries
    .map((entry) => {
      const importPath = toImportPath(loadersOutputPath, entry.absolutePath);
      return `  ${entry.namespace}: () => import('${importPath}.json').then((m) => m.default),`;
    })
    .join("\n");

  return (
    `${GENERATED_FILE_BANNER}` +
    `import { ensureNamespacesLoadedImpl } from '@xndrjs/i18n';\n` +
    `import { validateExternalNamespace } from '${dictionarySchemaImport}';\n` +
    `import type { ${schemaTypeName}, LazyNamespace } from '${typesImport}';\n` +
    `import type { ${factoryName} } from '${instanceImport}';\n\n` +
    `export const namespaceLoaders: Record<\n` +
    `  LazyNamespace,\n` +
    `  () => Promise<${schemaTypeName}[LazyNamespace]>\n` +
    `> = {\n${loaderEntries}\n};\n\n` +
    `export async function ensureNamespacesLoaded(\n` +
    `  i18n: ReturnType<typeof ${factoryName}>,\n` +
    `  namespaces: LazyNamespace[],\n` +
    `): Promise<void> {\n` +
    `  return ensureNamespacesLoadedImpl<${schemaTypeName}, LazyNamespace>(\n` +
    `    {\n` +
    `      provider: i18n,\n` +
    `      resolveLoader: (namespace) => namespaceLoaders[namespace],\n` +
    `      validate: (namespace, raw) => validateExternalNamespace(namespace, raw),\n` +
    `    },\n` +
    `    namespaces,\n` +
    `  );\n` +
    `}\n`
  );
}
