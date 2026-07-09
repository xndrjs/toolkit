import { GENERATED_FILE_BANNER, toModuleBasename, toRelativeModuleImport } from "../paths.js";
import type { ImportExtension } from "../types.js";

export interface InstanceFileOptions {
  isSingle: boolean;
  hasLazy: boolean;
  typesOutputPath: string;
  paramsTypeName: string;
  schemaTypeName: string;
  localeTypeName: string;
  localeFallbackConstName: string;
  factoryName: string;
  hasLocaleFallback: boolean;
  hasLocaleType: boolean;
  namespaceNames: string[];
  importExtension: ImportExtension;
}

export function formatInstanceFile(options: InstanceFileOptions): string {
  const {
    isSingle,
    hasLazy,
    typesOutputPath,
    paramsTypeName,
    schemaTypeName,
    localeTypeName,
    localeFallbackConstName,
    factoryName,
    hasLocaleFallback,
    hasLocaleType,
    namespaceNames,
    importExtension,
  } = options;

  const providerClass = isSingle ? "IcuTranslationProviderSingle" : "IcuTranslationProviderMulti";
  const typesModule = toModuleBasename(typesOutputPath);
  const typesImport = toRelativeModuleImport(typesModule, importExtension);
  const dictionaryParamType = hasLazy ? "InitialSchema" : schemaTypeName;
  const schemaTypesImport = hasLazy
    ? `import type { ${paramsTypeName}, ${schemaTypeName}, InitialSchema } from '${typesImport}';\n`
    : `import type { ${paramsTypeName}, ${schemaTypeName} } from '${typesImport}';\n`;
  const providerTypeArgs = hasLocaleFallback
    ? `${schemaTypeName}, ${paramsTypeName}, ${localeTypeName}, typeof ${localeFallbackConstName}`
    : `${schemaTypeName}, ${paramsTypeName}`;
  const providerOptions = hasLocaleFallback
    ? `, {\n    localeFallback: ${localeFallbackConstName},\n  }`
    : "";
  const typesImportLine = hasLocaleType
    ? hasLocaleFallback
      ? `import { ${localeFallbackConstName}, type ${localeTypeName} } from '${typesImport}';\n`
      : `import type { ${localeTypeName} } from '${typesImport}';\n`
    : "";
  const localesParamType = hasLocaleType ? `readonly ${localeTypeName}[]` : "readonly string[]";
  const projectLocalesFallbackArg = hasLocaleFallback ? `, ${localeFallbackConstName}` : "";
  const coreImports = isSingle
    ? "projectLocales as projectLocalesCore"
    : "projectLocales as projectLocalesCore, projectNamespacesLocales as projectNamespacesLocalesCore";
  const projectLocalesBlock = isSingle
    ? `\n` +
      `export function projectLocales(\n` +
      `  dictionary: ${schemaTypeName},\n` +
      `  locales: ${localesParamType},\n` +
      `): ${schemaTypeName} {\n` +
      `  return projectLocalesCore(dictionary, locales${projectLocalesFallbackArg});\n` +
      `}\n`
    : formatMultiProjectLocalesBlock(
        schemaTypeName,
        namespaceNames,
        localesParamType,
        projectLocalesFallbackArg
      );

  return (
    `${GENERATED_FILE_BANNER}` +
    `import { ${providerClass}, ${coreImports} } from '@xndrjs/i18n';\n` +
    schemaTypesImport +
    typesImportLine +
    `\n` +
    `export function ${factoryName}(\n` +
    `  dictionary: ${dictionaryParamType},\n` +
    `) {\n` +
    `  return new ${providerClass}<${providerTypeArgs}>(dictionary${providerOptions});\n` +
    `}\n` +
    projectLocalesBlock
  );
}

function formatMultiProjectLocalesBlock(
  schemaTypeName: string,
  namespaceNames: string[],
  localesParamType: string,
  projectLocalesFallbackArg: string
): string {
  const overloads = namespaceNames
    .map(
      (namespace) =>
        `export function projectNamespaceLocales(\n` +
        `  dictionary: ${schemaTypeName}["${namespace}"],\n` +
        `  locales: ${localesParamType},\n` +
        `): ${schemaTypeName}["${namespace}"];`
    )
    .join("\n");

  return (
    `\n` +
    `export function projectLocales(\n` +
    `  dictionary: ${schemaTypeName},\n` +
    `  locales: ${localesParamType},\n` +
    `): ${schemaTypeName} {\n` +
    `  return projectNamespacesLocalesCore(dictionary, locales${projectLocalesFallbackArg});\n` +
    `}\n` +
    `\n` +
    overloads +
    `\n` +
    `export function projectNamespaceLocales(\n` +
    `  dictionary: ${schemaTypeName}[keyof ${schemaTypeName}],\n` +
    `  locales: ${localesParamType},\n` +
    `): ${schemaTypeName}[keyof ${schemaTypeName}] {\n` +
    `  return projectLocalesCore(dictionary, locales${projectLocalesFallbackArg});\n` +
    `}\n`
  );
}
