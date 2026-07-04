import { GENERATED_FILE_BANNER, toModuleBasename } from "../paths.js";

export interface InstanceFileOptions {
  isSingle: boolean;
  hasLazy: boolean;
  typesOutputPath: string;
  dictionaryOutputPath: string;
  paramsTypeName: string;
  schemaTypeName: string;
  localeTypeName: string;
  localeFallbackConstName: string;
  factoryName: string;
  hasLocaleFallback: boolean;
}

export function formatInstanceFile(options: InstanceFileOptions): string {
  const {
    isSingle,
    hasLazy,
    typesOutputPath,
    dictionaryOutputPath,
    paramsTypeName,
    schemaTypeName,
    localeTypeName,
    localeFallbackConstName,
    factoryName,
    hasLocaleFallback,
  } = options;

  const providerClass = isSingle ? "IcuTranslationProviderSingle" : "IcuTranslationProviderMulti";
  const typesModule = toModuleBasename(typesOutputPath);
  const dictionaryModule = toModuleBasename(dictionaryOutputPath);
  const initialDictionaryType = hasLazy ? "InitialSchema" : schemaTypeName;
  const initialDictionaryImport = hasLazy
    ? `import type { ${paramsTypeName}, ${schemaTypeName}, InitialSchema } from './${typesModule}.js';\n`
    : `import type { ${paramsTypeName}, ${schemaTypeName} } from './${typesModule}.js';\n`;
  const providerTypeArgs = hasLocaleFallback
    ? `${schemaTypeName}, ${paramsTypeName}, ${localeTypeName}, typeof ${localeFallbackConstName}`
    : `${schemaTypeName}, ${paramsTypeName}`;
  const providerOptions = hasLocaleFallback
    ? `, {\n    localeFallback: ${localeFallbackConstName},\n  }`
    : "";
  const fallbackImport = hasLocaleFallback
    ? `import { ${localeFallbackConstName}, type ${localeTypeName} } from './${typesModule}.js';\n`
    : "";

  return (
    `${GENERATED_FILE_BANNER}` +
    `import { ${providerClass} } from '@xndrjs/i18n';\n` +
    `import { dictionary } from './${dictionaryModule}.js';\n` +
    initialDictionaryImport +
    fallbackImport +
    `\n` +
    `export function ${factoryName}(\n` +
    `  initialDictionary: ${initialDictionaryType} = dictionary,\n` +
    `) {\n` +
    `  return new ${providerClass}<${providerTypeArgs}>(initialDictionary${providerOptions});\n` +
    `}\n`
  );
}
