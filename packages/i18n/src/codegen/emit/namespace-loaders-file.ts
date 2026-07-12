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
  paramsTypeName: string;
  localeTypeName: string;
  localeFallbackConstName: string;
  hasLocaleFallback: boolean;
  typesModule: string;
  importExtension: ImportExtension;
  projectRoot: string;
  isSingle?: boolean;
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
  loadNamespacesFunctionName: string;
}

function formatI18nMultiInstanceType(options: NamespaceLoadersFileOptions): string {
  const {
    schemaTypeName,
    paramsTypeName,
    localeTypeName,
    localeFallbackConstName,
    hasLocaleFallback,
  } = options;

  const typeArgs = hasLocaleFallback
    ? `${schemaTypeName}, ${paramsTypeName}, ${localeTypeName}, typeof ${localeFallbackConstName}`
    : `${schemaTypeName}, ${paramsTypeName}`;

  return `IcuTranslationProviderMulti<${typeArgs}>`;
}

function formatDefaultNamespacesLiteral(lazyEntries: NamespaceEntry[]): string {
  return [...lazyEntries]
    .map((entry) => entry.namespace)
    .sort()
    .map((namespace) => JSON.stringify(namespace))
    .join(", ");
}

function formatLoadNamespacesHelper(
  options: NamespaceLoadersFileOptions,
  { paramName, paramTypeName, loadNamespacesFunctionName }: PartitionedNamespaceLoadersParams
): string {
  const { lazyEntries } = options;
  const defaultNamespaces = formatDefaultNamespacesLiteral(lazyEntries);

  return (
    `\ntype I18nMultiInstance = ${formatI18nMultiInstanceType(options)};\n\n` +
    `export async function ${loadNamespacesFunctionName}(\n` +
    `  i18n: I18nMultiInstance,\n` +
    `  ${paramName}: ${paramTypeName},\n` +
    `  namespaces: readonly LazyNamespace[] = [${defaultNamespaces}] as const,\n` +
    `): Promise<void> {\n` +
    `  await Promise.all(\n` +
    `    namespaces.map(async (namespace) => {\n` +
    `      if (i18n.hasNamespace(namespace)) {\n` +
    `        return;\n` +
    `      }\n` +
    `      i18n.setNamespace(namespace, await namespaceLoaders[namespace](${paramName}));\n` +
    `    }),\n` +
    `  );\n` +
    `}\n`
  );
}

function formatPartitionedTypesImport(
  options: NamespaceLoadersFileOptions,
  paramTypeName: string
): string {
  const {
    schemaTypeName,
    paramsTypeName,
    localeTypeName,
    localeFallbackConstName,
    hasLocaleFallback,
    typesModule,
    importExtension,
    isSingle,
  } = options;

  if (isSingle) {
    return `import type { ${schemaTypeName}, LazyNamespace, ${paramTypeName} } from '${toRelativeModuleImport(typesModule, importExtension)}';\n\n`;
  }

  const fallbackImport = hasLocaleFallback ? `${localeFallbackConstName}, ` : "";
  const paramTypeImport = paramTypeName === localeTypeName ? "" : `, type ${paramTypeName}`;
  return (
    `import { IcuTranslationProviderMulti } from '@xndrjs/i18n';\n` +
    `import { ${fallbackImport}type ${localeTypeName}, type ${paramsTypeName}, type ${schemaTypeName}, type LazyNamespace${paramTypeImport} } from '${toRelativeModuleImport(typesModule, importExtension)}';\n\n`
  );
}

/**
 * Emits lazy loaders for split-by-locale and custom delivery.
 * Each namespace gets a function that dynamic-imports the JSON for the given
 * partition key (locale or area) via a switch.
 */
function formatPartitionedNamespaceLoadersFile(
  options: NamespaceLoadersFileOptions,
  params: PartitionedNamespaceLoadersParams
): string {
  const { partitionKeys, paramName, paramTypeName } = params;
  const {
    loadersOutputPath,
    lazyEntries,
    schemaTypeName,
    projectRoot,
    splitPathsByNamespace = {},
  } = options;

  const typesImport = formatPartitionedTypesImport(options, paramTypeName);
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
    typesImport +
    `export const namespaceLoaders: {\n` +
    `  [K in LazyNamespace]: (${paramName}: ${paramTypeName}) => Promise<${schemaTypeName}[K]>;\n` +
    `} = {\n${loaderEntries}\n};\n` +
    (options.isSingle ? "" : formatLoadNamespacesHelper(options, params))
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
      loadNamespacesFunctionName: "ensureNamespacesLoadedForLocale",
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
      loadNamespacesFunctionName: "ensureNamespacesLoadedForArea",
    });
  }
  return formatCanonicalNamespaceLoadersFile(options);
}
