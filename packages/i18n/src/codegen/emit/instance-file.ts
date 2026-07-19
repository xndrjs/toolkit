import { GENERATED_FILE_BANNER, toModuleBasename, toRelativeModuleImport } from "../paths.js";
import type { DeliveryMode, LoaderStrategy } from "../codegen-config-schema.js";
import type { ImportExtension } from "../types.js";

/** Emits the generated instance module: `createI18n` factory wrapping the ICU provider. */
export interface InstanceFileOptions {
  typesOutputPath: string;
  namespaceLoadersOutputPath: string;
  paramsTypeName: string;
  schemaTypeName: string;
  localeTypeName: string;
  localeFallbackConstName: string;
  factoryName: string;
  hasLocaleFallback: boolean;
  hasLocaleType: boolean;
  importExtension: ImportExtension;
  delivery: DeliveryMode;
  localeDeliveryAreaConstName?: string;
  loaderStrategy?: LoaderStrategy;
}

const STATE_TYPE = `{ dictionary: InitialSchema; resources?: readonly (readonly [string, string])[] }`;

export function formatInstanceFile(options: InstanceFileOptions): string {
  const {
    typesOutputPath,
    namespaceLoadersOutputPath,
    paramsTypeName,
    schemaTypeName,
    localeTypeName,
    localeFallbackConstName,
    factoryName,
    hasLocaleFallback,
    hasLocaleType,
    importExtension,
    delivery,
    localeDeliveryAreaConstName = "LOCALE_DELIVERY_AREA",
    loaderStrategy = "import",
  } = options;

  const providerClass = "IcuTranslationProviderMulti";
  const typesModule = toModuleBasename(typesOutputPath);
  const typesImport = toRelativeModuleImport(typesModule, importExtension);
  const loadersModule = toModuleBasename(namespaceLoadersOutputPath);
  const loadersImport = toRelativeModuleImport(loadersModule, importExtension);
  const schemaTypesImport = `import type { ${paramsTypeName}, ${schemaTypeName}, InitialSchema } from '${typesImport}';\n`;
  const typesImportLine = formatTypesValueImport({
    hasLocaleType,
    hasLocaleFallback,
    localeTypeName,
    localeFallbackConstName,
    localeDeliveryAreaConstName,
    delivery,
    typesImport,
  });
  const packageImports = formatPackageImports(providerClass, loaderStrategy);
  const loadersImportLine =
    loaderStrategy === "fetch"
      ? `import { createNamespaceLoaders } from '${loadersImport}';\n`
      : `import { namespaceLoaders } from '${loadersImport}';\n`;

  const createFactoryBlock = formatCreateI18nFactory({
    providerClass,
    schemaTypeName,
    paramsTypeName,
    localeTypeName,
    localeFallbackConstName,
    factoryName,
    hasLocaleFallback,
    delivery,
    localeDeliveryAreaConstName,
    loaderStrategy,
  });

  return (
    `${GENERATED_FILE_BANNER}` +
    `import {\n` +
    `  ${packageImports},\n` +
    `} from '@xndrjs/i18n';\n` +
    schemaTypesImport +
    typesImportLine +
    loadersImportLine +
    `\n` +
    createFactoryBlock
  );
}

function formatTypesValueImport(options: {
  hasLocaleType: boolean;
  hasLocaleFallback: boolean;
  localeTypeName: string;
  localeFallbackConstName: string;
  localeDeliveryAreaConstName: string;
  delivery: DeliveryMode;
  typesImport: string;
}): string {
  const {
    hasLocaleType,
    hasLocaleFallback,
    localeTypeName,
    localeFallbackConstName,
    localeDeliveryAreaConstName,
    delivery,
    typesImport,
  } = options;

  if (!hasLocaleType && delivery !== "custom") {
    return "";
  }

  const valueNames: string[] = [];
  if (hasLocaleFallback) {
    valueNames.push(localeFallbackConstName);
  }
  if (delivery === "custom") {
    valueNames.push(localeDeliveryAreaConstName);
  }

  if (valueNames.length > 0 && hasLocaleType) {
    return `import { ${valueNames.join(", ")}, type ${localeTypeName} } from '${typesImport}';\n`;
  }
  if (valueNames.length > 0) {
    return `import { ${valueNames.join(", ")} } from '${typesImport}';\n`;
  }
  if (hasLocaleType) {
    return `import type { ${localeTypeName} } from '${typesImport}';\n`;
  }
  return "";
}

function formatCreateI18nFactory(options: {
  providerClass: string;
  schemaTypeName: string;
  paramsTypeName: string;
  localeTypeName: string;
  localeFallbackConstName: string;
  factoryName: string;
  hasLocaleFallback: boolean;
  delivery: DeliveryMode;
  localeDeliveryAreaConstName: string;
  loaderStrategy: LoaderStrategy;
}): string {
  const {
    providerClass,
    schemaTypeName,
    paramsTypeName,
    localeTypeName,
    localeFallbackConstName,
    factoryName,
    hasLocaleFallback,
    delivery,
    localeDeliveryAreaConstName,
    loaderStrategy,
  } = options;

  const providerTypeArgs = hasLocaleFallback
    ? `${schemaTypeName}, ${paramsTypeName}, ${localeTypeName}, typeof ${localeFallbackConstName}`
    : `${schemaTypeName}, ${paramsTypeName}`;
  const handleReturnType = `I18nHandle<${schemaTypeName}, ${paramsTypeName}, ${localeTypeName}>`;
  const handleTypeArgs = `<${schemaTypeName}, ${paramsTypeName}, ${localeTypeName}>`;

  const partitionForLocale =
    delivery === "custom"
      ? `    partitionForLocale: (locale) => ${localeDeliveryAreaConstName}[locale],\n`
      : `    partitionForLocale: (locale) => locale,\n`;

  const optionsType =
    loaderStrategy === "fetch"
      ? `{ fetchImpl: FetchArtifact; state?: ${STATE_TYPE}; onMissing?: OnMissingTranslation }`
      : `{ state?: ${STATE_TYPE}; onMissing?: OnMissingTranslation }`;

  const optionsParam =
    loaderStrategy === "fetch" ? `  options: ${optionsType},\n` : `  options?: ${optionsType},\n`;

  const namespaceLoadersLine =
    loaderStrategy === "fetch"
      ? `    namespaceLoaders: createNamespaceLoaders(fetchImpl),\n`
      : `    namespaceLoaders,\n`;

  return (
    `export function ${factoryName}(\n` +
    optionsParam +
    `): ${handleReturnType} {\n` +
    formatBody({
      providerClass,
      providerTypeArgs,
      hasLocaleFallback,
      localeFallbackConstName,
      loaderStrategy,
    }) +
    `  engine.seedBuilderResources(normalized.resources);\n` +
    `  return createI18nHandle${handleTypeArgs}(engine, {\n` +
    namespaceLoadersLine +
    partitionForLocale +
    `  } as I18nHandleOptions<${schemaTypeName}, ${localeTypeName}>);\n` +
    `}\n`
  );
}

function formatBody(options: {
  providerClass: string;
  providerTypeArgs: string;
  hasLocaleFallback: boolean;
  localeFallbackConstName: string;
  loaderStrategy: LoaderStrategy;
}): string {
  const {
    providerClass,
    providerTypeArgs,
    hasLocaleFallback,
    localeFallbackConstName,
    loaderStrategy,
  } = options;

  if (loaderStrategy === "fetch") {
    const engineBlock = hasLocaleFallback
      ? `  const engine = new ${providerClass}<${providerTypeArgs}>(normalized.dictionary, {\n` +
        `    localeFallback: ${localeFallbackConstName},\n` +
        `    ...providerOptions,\n` +
        `  });\n`
      : `  const engine = new ${providerClass}<${providerTypeArgs}>(normalized.dictionary, providerOptions);\n`;

    return (
      `  const { fetchImpl, state, ...providerOptions } = options;\n` +
      `  const normalized = normalizeI18nCreateInput(state);\n` +
      engineBlock
    );
  }

  const engineBlock = hasLocaleFallback
    ? `  const engine = new ${providerClass}<${providerTypeArgs}>(normalized.dictionary, {\n` +
      `    localeFallback: ${localeFallbackConstName},\n` +
      `    ...providerOptions,\n` +
      `  });\n`
    : `  const engine = new ${providerClass}<${providerTypeArgs}>(normalized.dictionary, providerOptions);\n`;

  return (
    `  const { state, ...providerOptions } = options ?? {};\n` +
    `  const normalized = normalizeI18nCreateInput(state);\n` +
    engineBlock
  );
}

function formatPackageImports(providerClass: string, loaderStrategy: LoaderStrategy): string {
  const names = [
    providerClass,
    "createI18nHandle",
    "normalizeI18nCreateInput",
    "type I18nHandle",
    "type I18nHandleOptions",
    "type OnMissingTranslation",
  ];
  if (loaderStrategy === "fetch") {
    names.push("type FetchArtifact");
  }
  return names.join(",\n  ");
}
