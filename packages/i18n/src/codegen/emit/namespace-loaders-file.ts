import { GENERATED_FILE_BANNER, toImportPath } from "../paths.js";
import type { NamespaceEntry } from "../types.js";

export function formatNamespaceLoadersFile(
  loadersOutputPath: string,
  lazyEntries: (NamespaceEntry & { absolutePath: string })[],
  schemaTypeName: string,
  typesModule: string,
  dictionarySchemaModule: string,
  instanceModule: string,
  factoryName: string
): string {
  const loaderEntries = lazyEntries
    .map((entry) => {
      const importPath = toImportPath(loadersOutputPath, entry.absolutePath);
      return `  ${entry.namespace}: () => import('${importPath}.json').then((m) => m.default),`;
    })
    .join("\n");

  return (
    `${GENERATED_FILE_BANNER}` +
    `import { ensureNamespacesLoadedImpl } from '@xndrjs/i18n';\n` +
    `import { validateExternalNamespace } from './${dictionarySchemaModule}.js';\n` +
    `import type { ${schemaTypeName}, LazyNamespace } from './${typesModule}.js';\n` +
    `import type { ${factoryName} } from './${instanceModule}.js';\n\n` +
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
