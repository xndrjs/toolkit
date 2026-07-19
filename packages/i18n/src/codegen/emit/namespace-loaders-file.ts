import path from "node:path";
import type { DeliveryMode, LoaderStrategy } from "../codegen-config-schema.js";
import { GENERATED_FILE_BANNER, toImportPath, toRelativeModuleImport } from "../paths.js";
import type { ImportExtension, NamespaceEntry } from "../types.js";

/**
 * Emits the generated `namespace-loaders.generated.ts` module: dynamic `import()`
 * or injectable `fetchImpl(resourceId)` loaders, shaped by delivery mode.
 */
export interface NamespaceLoadersFileOptions {
  loadersOutputPath: string;
  lazyEntries: (NamespaceEntry & { absolutePath: string })[];
  schemaTypeName: string;
  localeTypeName: string;
  typesModule: string;
  importExtension: ImportExtension;
  projectRoot: string;
  delivery: DeliveryMode;
  splitPathsByNamespace?: Record<string, Record<string, string>>;
  requestLocales?: readonly string[];
  deliveryAreaTypeName?: string;
  deliveryAreaNames?: readonly string[];
  loaderStrategy?: LoaderStrategy;
}

interface PartitionedNamespaceLoadersParams {
  partitionKeys: readonly string[];
  paramName: string;
  paramTypeName: string;
}

function formatDefaultNamespacesLiteral(lazyEntries: NamespaceEntry[]): string {
  return [...lazyEntries]
    .map((entry) => entry.namespace)
    .sort()
    .map((namespace) => JSON.stringify(namespace))
    .join(", ");
}

function formatPartitionedTypesImport(
  options: NamespaceLoadersFileOptions,
  paramTypeName: string
): string {
  const { schemaTypeName, typesModule, importExtension } = options;
  return `import type { ${schemaTypeName}, LazyNamespace, ${paramTypeName} } from '${toRelativeModuleImport(typesModule, importExtension)}';\n\n`;
}

function formatImportCase(
  loadersOutputPath: string,
  projectRoot: string,
  splitRelativePath: string
): string {
  const importPath = toImportPath(loadersOutputPath, path.resolve(projectRoot, splitRelativePath));
  return `return import('${importPath}.json').then((m) => m.default);`;
}

function indentBlock(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => (line.length === 0 ? line : `${pad}${line}`))
    .join("\n");
}

function formatImportNamespaceLoaderEntry(options: {
  namespace: string;
  paramName: string;
  partitionKeys: readonly string[];
  splitPathsByNamespace: Record<string, Record<string, string>>;
  loadersOutputPath: string;
  projectRoot: string;
}): string {
  const {
    namespace,
    paramName,
    partitionKeys,
    splitPathsByNamespace,
    loadersOutputPath,
    projectRoot,
  } = options;

  const caseBodies = partitionKeys.map((partitionKey) => {
    const splitRelativePath = splitPathsByNamespace[namespace]?.[partitionKey];
    if (!splitRelativePath) {
      throw new Error(
        `[Codegen Error] Missing split path for namespace "${namespace}", ${paramName} "${partitionKey}".`
      );
    }
    const body = formatImportCase(loadersOutputPath, projectRoot, splitRelativePath);
    return [`case ${JSON.stringify(partitionKey)}:`, `  ${body}`].join("\n");
  });

  const switchBody = [
    ...caseBodies,
    `default:`,
    `  throw new Error(\`[i18n] No translation artifact for namespace ${JSON.stringify(namespace)} and ${paramName} "\${String(${paramName})}".\`);`,
  ].join("\n");

  const entry = [
    `${namespace}: (${paramName}) => {`,
    `  switch (${paramName}) {`,
    indentBlock(switchBody, 4),
    `  }`,
    `},`,
  ].join("\n");

  return indentBlock(entry, 2);
}

/** Fetch loaders forward a resource id; URL mapping is left to `fetchImpl`. */
function formatFetchNamespaceLoaderEntry(options: {
  namespace: string;
  paramName: string;
  schemaTypeName: string;
  delivery: DeliveryMode;
}): string {
  const { namespace, paramName, schemaTypeName, delivery } = options;
  const nsLiteral = JSON.stringify(namespace);
  const resourceId =
    delivery === "custom"
      ? `{ locale, namespace: ${nsLiteral}, area }`
      : `{ locale, namespace: ${nsLiteral} }`;

  // Custom: partition is area; locale comes from load() context.
  // Split-by-locale: partition is locale (second arg unused).
  const signature = delivery === "custom" ? `(${paramName}, { locale })` : `(${paramName})`;

  return indentBlock(
    `${namespace}: ${signature} =>\n` +
      `  fetchImpl(${resourceId}) as Promise<${schemaTypeName}[${nsLiteral}]>,`,
    4
  );
}

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
    delivery,
    splitPathsByNamespace = {},
  } = options;
  const loaderStrategy = options.loaderStrategy ?? "import";

  const loaderValueType = `${schemaTypeName}[K]`;
  const typesImport = formatPartitionedTypesImport(options, paramTypeName);

  if (loaderStrategy === "fetch") {
    // Fetch loaders ignore partition-key switches: the resource id is enough for the app.
    const fetchLoadersType = `{\n  [K in LazyNamespace]: (${
      delivery === "custom"
        ? `${paramName}: ${paramTypeName}, context: { locale: string }`
        : `${paramName}: ${paramTypeName}`
    }) => Promise<${loaderValueType}>;\n}`;

    const loaderEntries = lazyEntries
      .map((entry) =>
        formatFetchNamespaceLoaderEntry({
          namespace: entry.namespace,
          paramName,
          schemaTypeName,
          delivery,
        })
      )
      .join("\n");

    return (
      `${GENERATED_FILE_BANNER}` +
      `import type { FetchArtifact } from '@xndrjs/i18n';\n` +
      typesImport +
      `export type NamespaceLoaders = ${fetchLoadersType};\n\n` +
      `/** Build loaders that resolve artifacts via the injected {@link FetchArtifact} (resource id only). */\n` +
      `export function createNamespaceLoaders(fetchImpl: FetchArtifact): NamespaceLoaders {\n` +
      `  return {\n${loaderEntries}\n  };\n` +
      `}\n\n` +
      `export const defaultLazyNamespaces = [${formatDefaultNamespacesLiteral(lazyEntries)}] as const;\n`
    );
  }

  const loaderEntries = lazyEntries
    .map((entry) =>
      formatImportNamespaceLoaderEntry({
        namespace: entry.namespace,
        paramName,
        partitionKeys,
        splitPathsByNamespace,
        loadersOutputPath,
        projectRoot,
      })
    )
    .join("\n");

  // Import loaders only use the partition key; context is accepted for a uniform NamespaceLoader shape.
  const importLoadersType = `{\n  [K in LazyNamespace]: (${paramName}: ${paramTypeName}) => Promise<${loaderValueType}>;\n}`;

  return (
    `${GENERATED_FILE_BANNER}` +
    typesImport +
    `export const namespaceLoaders: ${importLoadersType} = {\n${loaderEntries}\n};\n` +
    `\n` +
    `export const defaultLazyNamespaces = [${formatDefaultNamespacesLiteral(lazyEntries)}] as const;\n`
  );
}

/**
 * Builds `namespace-loaders.generated.ts` for split-by-locale or custom delivery areas.
 */
export function formatNamespaceLoadersFile(options: NamespaceLoadersFileOptions): string {
  if (options.delivery === "split-by-locale") {
    return formatPartitionedNamespaceLoadersFile(options, {
      partitionKeys: options.requestLocales ?? [],
      paramName: "locale",
      paramTypeName: options.localeTypeName,
    });
  }
  if (!options.deliveryAreaTypeName) {
    throw new Error("[Codegen Error] deliveryAreaTypeName is required for custom delivery.");
  }
  return formatPartitionedNamespaceLoadersFile(options, {
    partitionKeys: options.deliveryAreaNames ?? [],
    paramName: "area",
    paramTypeName: options.deliveryAreaTypeName,
  });
}
