import path from "node:path";
import type { DeliveryMode } from "../codegen-config-schema.js";
import { GENERATED_FILE_BANNER, toImportPath, toRelativeModuleImport } from "../paths.js";
import type { ImportExtension, NamespaceEntry } from "../types.js";

/**
 * Emits the generated `namespace-loaders.generated.ts` module: dynamic `import()`
 * functions for lazy-loaded namespaces, shaped by delivery mode.
 */
export interface NamespaceLoadersFileOptions {
  loadersOutputPath: string;
  lazyEntries: (NamespaceEntry & { absolutePath: string })[];
  schemaTypeName: string;
  localeTypeName: string;
  typesModule: string;
  importExtension: ImportExtension;
  projectRoot: string;
  delivery?: DeliveryMode;
  splitPathsByNamespace?: Record<string, Record<string, string>>;
  requestLocales?: readonly string[];
  deliveryAreaTypeName?: string;
  deliveryAreaNames?: readonly string[];
}

interface PartitionedNamespaceLoadersParams {
  partitionKeys: readonly string[];
  paramName: string;
  paramTypeName: string;
}

/**
 * Emits lazy loaders for split-by-locale and custom delivery.
 * Each namespace gets a function that dynamic-imports the JSON for the given
 * partition key (locale or area) via a switch.
 */
function formatPartitionedNamespaceLoadersFile(
  options: NamespaceLoadersFileOptions,
  { partitionKeys, paramName, paramTypeName }: PartitionedNamespaceLoadersParams
): string {
  const {
    loadersOutputPath,
    lazyEntries,
    schemaTypeName,
    typesModule,
    importExtension,
    projectRoot,
    splitPathsByNamespace = {},
  } = options;

  const typesImport = toRelativeModuleImport(typesModule, importExtension);
  const loaderEntries = lazyEntries
    .map((entry) => {
      const switchCases = partitionKeys
        .map((partitionKey) => {
          const splitRelativePath = splitPathsByNamespace[entry.namespace]?.[partitionKey];
          if (!splitRelativePath) {
            throw new Error(
              `[Codegen Error] Missing split path for namespace "${entry.namespace}", ${paramName} "${partitionKey}".`
            );
          }
          const importPath = toImportPath(
            loadersOutputPath,
            path.resolve(projectRoot, splitRelativePath)
          );
          return (
            `      case ${JSON.stringify(partitionKey)}:\n` +
            `        return import('${importPath}.json').then((m) => m.default);`
          );
        })
        .join("\n");

      return (
        `  ${entry.namespace}: (${paramName}) => {\n` +
        `    switch (${paramName}) {\n${switchCases}\n` +
        `    }\n` +
        `  },`
      );
    })
    .join("\n");

  return (
    `${GENERATED_FILE_BANNER}` +
    `import type { ${schemaTypeName}, LazyNamespace, ${paramTypeName} } from '${typesImport}';\n\n` +
    `export const namespaceLoaders: {\n` +
    `  [K in LazyNamespace]: (${paramName}: ${paramTypeName}) => Promise<${schemaTypeName}[K]>;\n` +
    `} = {\n${loaderEntries}\n};\n`
  );
}

/** Emits lazy loaders for canonical delivery: one dynamic import per namespace. */
function formatCanonicalNamespaceLoadersFile(options: NamespaceLoadersFileOptions): string {
  const { loadersOutputPath, lazyEntries, schemaTypeName, typesModule, importExtension } = options;
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

/**
 * Builds `namespace-loaders.generated.ts` for the configured delivery mode:
 * canonical, split-by-locale, or custom areas.
 */
export function formatNamespaceLoadersFile(options: NamespaceLoadersFileOptions): string {
  const delivery = options.delivery ?? "canonical";
  if (delivery === "split-by-locale") {
    return formatPartitionedNamespaceLoadersFile(options, {
      partitionKeys: options.requestLocales ?? [],
      paramName: "locale",
      paramTypeName: options.localeTypeName,
    });
  }
  if (delivery === "custom") {
    if (!options.deliveryAreaTypeName) {
      throw new Error("[Codegen Error] deliveryAreaTypeName is required for custom delivery.");
    }
    return formatPartitionedNamespaceLoadersFile(options, {
      partitionKeys: options.deliveryAreaNames ?? [],
      paramName: "area",
      paramTypeName: options.deliveryAreaTypeName,
    });
  }
  return formatCanonicalNamespaceLoadersFile(options);
}
