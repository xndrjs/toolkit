import { GENERATED_FILE_BANNER, toModuleBasename, toRelativeModuleImport } from "../paths.js";
import type { DeliveryMode } from "../codegen-config-schema.js";
import type { ImportExtension } from "../types.js";

/**
 * Emits the generated instance module: `createI18n` factory wrapping the ICU provider
 * plus runtime projection helpers (`projectDictionaryLocales`, etc.).
 */
export interface InstanceFileOptions {
  isSingle: boolean;
  hasLazy: boolean;
  typesOutputPath: string;
  namespaceLoadersOutputPath?: string;
  paramsTypeName: string;
  schemaTypeName: string;
  localeTypeName: string;
  localeFallbackConstName: string;
  factoryName: string;
  hasLocaleFallback: boolean;
  hasLocaleType: boolean;
  namespaceNames: string[];
  importExtension: ImportExtension;
  delivery: DeliveryMode;
}

export function formatInstanceFile(options: InstanceFileOptions): string {
  const {
    isSingle,
    hasLazy,
    typesOutputPath,
    namespaceLoadersOutputPath,
    paramsTypeName,
    schemaTypeName,
    localeTypeName,
    localeFallbackConstName,
    factoryName,
    hasLocaleFallback,
    hasLocaleType,
    namespaceNames,
    importExtension,
    delivery,
  } = options;

  const emitDeliveryAreaHelpers = delivery === "custom";
  const providerClass = isSingle ? "IcuTranslationProviderSingle" : "IcuTranslationProviderMulti";
  const typesModule = toModuleBasename(typesOutputPath);
  const typesImport = toRelativeModuleImport(typesModule, importExtension);
  const loadersModule = namespaceLoadersOutputPath
    ? toModuleBasename(namespaceLoadersOutputPath)
    : null;
  const loadersImport =
    loadersModule && namespaceLoadersOutputPath
      ? toRelativeModuleImport(loadersModule, importExtension)
      : null;
  const dictionaryParamType = hasLazy ? "InitialSchema" : schemaTypeName;
  const schemaTypesImport = hasLazy
    ? `import type { ${paramsTypeName}, ${schemaTypeName}, InitialSchema } from '${typesImport}';\n`
    : `import type { ${paramsTypeName}, ${schemaTypeName} } from '${typesImport}';\n`;
  const providerTypeArgs = hasLocaleFallback
    ? `${schemaTypeName}, ${paramsTypeName}, ${localeTypeName}, typeof ${localeFallbackConstName}`
    : `${schemaTypeName}, ${paramsTypeName}`;
  const providerOptions = hasLocaleFallback
    ? `, {\n    localeFallback: ${localeFallbackConstName},\n    ...options,\n  }`
    : `, options`;
  const typesImportLine = hasLocaleType
    ? hasLocaleFallback
      ? `import { ${localeFallbackConstName}, type ${localeTypeName} } from '${typesImport}';\n`
      : `import type { ${localeTypeName} } from '${typesImport}';\n`
    : "";
  const localesParamType = hasLocaleType ? `readonly ${localeTypeName}[]` : "readonly string[]";
  const fallbackArg = hasLocaleFallback ? `, ${localeFallbackConstName}` : "";
  const coreImports = formatCoreImports(isSingle, emitDeliveryAreaHelpers);
  const projectionBlock = isSingle
    ? formatSingleProjectionBlock(
        schemaTypeName,
        localesParamType,
        fallbackArg,
        emitDeliveryAreaHelpers
      )
    : formatMultiProjectionBlock(
        schemaTypeName,
        namespaceNames,
        localesParamType,
        fallbackArg,
        emitDeliveryAreaHelpers
      );

  const createFactoryBlock = formatCreateI18nFactory({
    isSingle,
    hasLazy,
    hasLocaleFallback,
    providerClass,
    providerTypeArgs,
    providerOptions,
    factoryName,
    dictionaryParamType,
    schemaTypeName,
    paramsTypeName,
    localeTypeName,
    namespaceNames,
    loadersImport,
  });

  return (
    `${GENERATED_FILE_BANNER}` +
    `import {\n` +
    `  ${providerClass},\n` +
    `  ${coreImports},\n` +
    `  createI18nBuilder,\n` +
    `  type I18nBuilderMulti,\n` +
    `  type I18nScopeMulti,\n` +
    `  type I18nScopeSingle,\n` +
    `  type OnMissingTranslation,\n` +
    `} from '@xndrjs/i18n';\n` +
    schemaTypesImport +
    typesImportLine +
    (hasLazy && loadersImport ? `import { namespaceLoaders } from '${loadersImport}';\n` : "") +
    `\n` +
    createFactoryBlock +
    projectionBlock
  );
}

function formatCreateI18nFactory(options: {
  isSingle: boolean;
  hasLazy: boolean;
  hasLocaleFallback: boolean;
  providerClass: string;
  providerTypeArgs: string;
  providerOptions: string;
  factoryName: string;
  dictionaryParamType: string;
  schemaTypeName: string;
  paramsTypeName: string;
  localeTypeName: string;
  namespaceNames: string[];
  loadersImport: string | null;
}): string {
  const {
    isSingle,
    hasLazy,
    providerClass,
    providerTypeArgs,
    providerOptions,
    factoryName,
    dictionaryParamType,
    schemaTypeName,
    paramsTypeName,
    localeTypeName,
    namespaceNames,
    loadersImport,
  } = options;

  if (isSingle) {
    return (
      `export function ${factoryName}(\n` +
      `  dictionary: ${dictionaryParamType},\n` +
      `  options?: { onMissing?: OnMissingTranslation },\n` +
      `): I18nScopeSingle<${schemaTypeName}, ${paramsTypeName}, ${localeTypeName}> {\n` +
      `  return new ${providerClass}<${providerTypeArgs}>(dictionary${providerOptions}).toScope();\n` +
      `}\n`
    );
  }

  if (!hasLazy) {
    const namespacesLiteral = `[${namespaceNames
      .slice()
      .sort()
      .map((ns) => JSON.stringify(ns))
      .join(", ")}] as const`;
    return (
      `export function ${factoryName}(\n` +
      `  dictionary: ${dictionaryParamType},\n` +
      `  options?: { onMissing?: OnMissingTranslation },\n` +
      `): I18nScopeMulti<${schemaTypeName}, ${paramsTypeName}, ${localeTypeName}> {\n` +
      `  const engine = new ${providerClass}<${providerTypeArgs}>(dictionary${providerOptions});\n` +
      `  return engine.toScope({ namespaces: ${namespacesLiteral} });\n` +
      `}\n`
    );
  }

  if (!loadersImport) {
    throw new Error("[Codegen Error] namespaceLoadersOutputPath is required when hasLazy is true.");
  }

  return (
    `export function ${factoryName}(\n` +
    `  dictionary: ${dictionaryParamType},\n` +
    `  options?: { onMissing?: OnMissingTranslation },\n` +
    `): I18nBuilderMulti<${schemaTypeName}, ${paramsTypeName}, ${localeTypeName}> {\n` +
    `  const engine = new ${providerClass}<${providerTypeArgs}>(dictionary${providerOptions});\n` +
    `  return createI18nBuilder(engine, {\n` +
    `    // The runtime builder expects a partition key typed as string.\n` +
    `    // Generated loaders are more specific (union of locales/areas), so we widen here.\n` +
    `    namespaceLoaders: namespaceLoaders as unknown as Record<string, (partition: string) => Promise<unknown>>,\n` +
    `  });\n` +
    `}\n`
  );
}

function formatCoreImports(isSingle: boolean, emitDeliveryAreaHelpers: boolean): string {
  if (isSingle) {
    const imports = ["projectNamespaceLocalesCore"];
    if (emitDeliveryAreaHelpers) {
      imports.push("projectNamespaceForDeliveryAreaCore");
    }
    return imports.join(", ");
  }

  const imports = ["projectNamespaceLocalesCore", "projectDictionaryLocalesCore"];
  if (emitDeliveryAreaHelpers) {
    imports.push("projectNamespaceForDeliveryAreaCore", "projectDictionaryForDeliveryAreaCore");
  }
  return imports.join(", ");
}

function formatSingleProjectionBlock(
  schemaTypeName: string,
  localesParamType: string,
  fallbackArg: string,
  emitDeliveryAreaHelpers: boolean
): string {
  let block =
    `\n` +
    `export function projectDictionaryLocales(\n` +
    `  dictionary: ${schemaTypeName},\n` +
    `  locales: ${localesParamType},\n` +
    `): ${schemaTypeName} {\n` +
    `  return projectNamespaceLocalesCore(dictionary, locales${fallbackArg});\n` +
    `}\n`;

  if (emitDeliveryAreaHelpers) {
    block +=
      `\n` +
      `export function projectDictionaryForDeliveryArea(\n` +
      `  dictionary: ${schemaTypeName},\n` +
      `  areaLocales: ${localesParamType},\n` +
      `): ${schemaTypeName} {\n` +
      `  return projectNamespaceForDeliveryAreaCore(dictionary, areaLocales${fallbackArg});\n` +
      `}\n`;
  }

  return block;
}

function formatMultiProjectionBlock(
  schemaTypeName: string,
  namespaceNames: string[],
  localesParamType: string,
  fallbackArg: string,
  emitDeliveryAreaHelpers: boolean
): string {
  const namespaceLocaleOverloads = namespaceNames
    .map(
      (namespace) =>
        `export function projectNamespaceLocales(\n` +
        `  dictionary: ${schemaTypeName}["${namespace}"],\n` +
        `  locales: ${localesParamType},\n` +
        `): ${schemaTypeName}["${namespace}"];`
    )
    .join("\n");

  const namespaceDeliveryOverloads = emitDeliveryAreaHelpers
    ? namespaceNames
        .map(
          (namespace) =>
            `export function projectNamespaceForDeliveryArea(\n` +
            `  dictionary: ${schemaTypeName}["${namespace}"],\n` +
            `  areaLocales: ${localesParamType},\n` +
            `): ${schemaTypeName}["${namespace}"];`
        )
        .join("\n")
    : "";

  let block =
    `\n` +
    `export function projectDictionaryLocales(\n` +
    `  dictionary: ${schemaTypeName},\n` +
    `  locales: ${localesParamType},\n` +
    `): ${schemaTypeName} {\n` +
    `  return projectDictionaryLocalesCore(dictionary, locales${fallbackArg});\n` +
    `}\n` +
    `\n` +
    namespaceLocaleOverloads +
    `\n` +
    `export function projectNamespaceLocales(\n` +
    `  dictionary: ${schemaTypeName}[keyof ${schemaTypeName}],\n` +
    `  locales: ${localesParamType},\n` +
    `): ${schemaTypeName}[keyof ${schemaTypeName}] {\n` +
    `  return projectNamespaceLocalesCore(dictionary, locales${fallbackArg});\n` +
    `}\n`;

  if (emitDeliveryAreaHelpers) {
    block +=
      `\n` +
      `export function projectDictionaryForDeliveryArea(\n` +
      `  dictionary: ${schemaTypeName},\n` +
      `  areaLocales: ${localesParamType},\n` +
      `): ${schemaTypeName} {\n` +
      `  return projectDictionaryForDeliveryAreaCore(dictionary, areaLocales${fallbackArg});\n` +
      `}\n` +
      `\n` +
      namespaceDeliveryOverloads +
      `\n` +
      `export function projectNamespaceForDeliveryArea(\n` +
      `  dictionary: ${schemaTypeName}[keyof ${schemaTypeName}],\n` +
      `  areaLocales: ${localesParamType},\n` +
      `): ${schemaTypeName}[keyof ${schemaTypeName}] {\n` +
      `  return projectNamespaceForDeliveryAreaCore(dictionary, areaLocales${fallbackArg});\n` +
      `}\n`;
  }

  return block;
}
