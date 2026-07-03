import fs from "node:fs";
import path from "node:path";
import { parse } from "@formatjs/icu-messageformat-parser";
import {
  extractVariables,
  mergeVariableSpecs,
  type VariableSpec,
} from "../icu/extract-variables.js";
import { validateLocaleFallback } from "../resolve-locale.js";

interface CodegenConfig {
  dictionary?: string;
  namespaces?: Record<string, string>;
  defaultNamespace?: string;
  typesOutput: string;
  dictionaryOutput: string;
  instanceOutput: string;
  dictionarySchemaOutput?: string;
  paramsTypeName: string;
  schemaTypeName: string;
  localeTypeName?: string;
  localeFallbackConstName?: string;
  localeFallback?: Record<string, string | null>;
  factoryName?: string;
}

interface NamespaceEntry {
  namespace: string;
  filePath: string;
}

type DictionaryJson = Record<string, Record<string, string>>;

function loadConfig(configPath: string): CodegenConfig {
  const raw = fs.readFileSync(configPath, "utf8");
  return JSON.parse(raw) as CodegenConfig;
}

function resolveNamespaces(config: CodegenConfig): NamespaceEntry[] {
  const hasDictionary = Boolean(config.dictionary);
  const hasNamespaces = Boolean(config.namespaces);

  if (hasDictionary === hasNamespaces) {
    throw new Error(
      '[Codegen Error] Config must specify exactly one of "dictionary" or "namespaces".'
    );
  }

  if (hasDictionary) {
    return [
      {
        namespace: config.defaultNamespace ?? "default",
        filePath: config.dictionary!,
      },
    ];
  }

  return Object.entries(config.namespaces!).map(([namespace, filePath]) => ({
    namespace,
    filePath,
  }));
}

function paramsTypeForVariables(variables: VariableSpec): string {
  const keys = Object.keys(variables);
  if (keys.length === 0) {
    return "never";
  }

  const props = keys.map((key) => {
    const type = variables[key] === "date" ? "Date | number" : variables[key];
    return `${key}: ${type}`;
  });
  return `{ ${props.join("; ")} }`;
}

function toImportPath(fromFile: string, toFile: string): string {
  const relative = path.relative(path.dirname(fromFile), toFile).replace(/\\/g, "/");
  const withoutExt = relative.replace(/\.json$/, "");
  return withoutExt.startsWith(".") ? withoutExt : `./${withoutExt}`;
}

const GENERATED_FILE_BANNER = "// Automatically generated code. Do not edit manually.\n";

function toModuleBasename(filePath: string): string {
  return path.basename(filePath).replace(/\.ts$/, "");
}

function toImportIdentifier(namespace: string): string {
  const safe = namespace.replace(/[^a-zA-Z0-9_$]/g, "_");
  if (/^[0-9]/.test(safe)) {
    return `ns_${safe}`;
  }
  return `${safe}Ns`;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
  throw new Error(message);
}

function collectRequestLocales(
  dictionaryLocales: Set<string>,
  fallback?: Record<string, string | null>
): Set<string> {
  const all = new Set(dictionaryLocales);
  if (!fallback) {
    return all;
  }

  for (const [locale, target] of Object.entries(fallback)) {
    all.add(locale);
    if (target !== null) {
      all.add(target);
    }
  }

  return all;
}

function validateCodegenLocaleFallback(
  fallback: Record<string, string | null>,
  dictionaryLocales: Set<string>
): boolean {
  let hasErrors = false;

  try {
    validateLocaleFallback(fallback);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Codegen Error] ${message}`);
    hasErrors = true;
  }

  for (const [locale, target] of Object.entries(fallback)) {
    if (target !== null && !(target in fallback) && !dictionaryLocales.has(target)) {
      console.error(
        `[Codegen Error] localeFallback: "${locale}" points to "${target}" which is not defined in the fallback map or dictionary locales`
      );
      hasErrors = true;
    }
  }

  return hasErrors;
}

function formatLocaleFallbackBlock(
  fallback: Record<string, string | null>,
  constName: string,
  typeName: string
): string {
  const lines = Object.entries(fallback)
    .map(
      ([locale, target]) =>
        `  ${JSON.stringify(locale)}: ${target === null ? "null" : JSON.stringify(target)},`
    )
    .join("\n");

  return (
    `export const ${constName} = {\n${lines}\n} as const satisfies Record<string, string | null>;\n\n` +
    `export type ${typeName} = typeof ${constName};\n\n`
  );
}

function formatVariableSpecObject(spec: VariableSpec): string {
  const entries = Object.entries(spec);
  if (entries.length === 0) {
    return "{}";
  }

  const lines = entries.map(
    ([name, type]) => `      ${JSON.stringify(name)}: ${JSON.stringify(type)},`
  );
  return `{\n${lines.join("\n")}\n    }`;
}

function formatDictionarySpecBlock(
  isSingle: boolean,
  entries: NamespaceEntry[],
  argsSpecByNamespace: Record<string, Record<string, VariableSpec>>
): string {
  if (isSingle) {
    const onlyNamespace = entries[0]!.namespace;
    const argsByKey = argsSpecByNamespace[onlyNamespace] ?? {};
    const requiredKeys = Object.keys(argsByKey)
      .map((key) => JSON.stringify(key))
      .join(", ");
    const argsLines = Object.entries(argsByKey)
      .map(([key, spec]) => `    ${JSON.stringify(key)}: ${formatVariableSpecObject(spec)},`)
      .join("\n");

    return (
      `export const DICTIONARY_SPEC = {\n` +
      `  mode: 'single' as const,\n` +
      `  requiredKeys: [${requiredKeys}] as const,\n` +
      `  argsByKey: {\n${argsLines}\n  },\n` +
      `} satisfies DictionarySpec;\n`
    );
  }

  const requiredKeysLines = entries
    .map((entry) => {
      const keys = Object.keys(argsSpecByNamespace[entry.namespace] ?? {})
        .map((key) => JSON.stringify(key))
        .join(", ");
      return `    ${JSON.stringify(entry.namespace)}: [${keys}] as const,`;
    })
    .join("\n");

  const argsByKeyLines = entries
    .map((entry) => {
      const argsByKey = argsSpecByNamespace[entry.namespace] ?? {};
      const keyLines = Object.entries(argsByKey)
        .map(([key, spec]) => `      ${JSON.stringify(key)}: ${formatVariableSpecObject(spec)},`)
        .join("\n");
      return `    ${JSON.stringify(entry.namespace)}: {\n${keyLines}\n    },`;
    })
    .join("\n");

  return (
    `export const DICTIONARY_SPEC = {\n` +
    `  mode: 'multi' as const,\n` +
    `  requiredKeys: {\n${requiredKeysLines}\n  },\n` +
    `  argsByKey: {\n${argsByKeyLines}\n  },\n` +
    `} satisfies DictionarySpec;\n`
  );
}

function formatDictionarySchemaFile(
  schemaTypeName: string,
  typesModule: string,
  isSingle: boolean,
  dictionarySpecBlock: string
): string {
  const namespaceImport = isSingle
    ? ""
    : `  validateExternalNamespace as validateExternalNamespaceImpl,\n`;
  const namespaceValidator = isSingle
    ? ""
    : `export function validateExternalNamespace<NS extends keyof ${schemaTypeName}>(\n` +
      `  namespace: NS,\n` +
      `  input: unknown,\n` +
      `) {\n` +
      `  return validateExternalNamespaceImpl<${schemaTypeName}[NS]>(\n` +
      `    namespace as string,\n` +
      `    input,\n` +
      `    DICTIONARY_SPEC,\n` +
      `  );\n` +
      `}\n\n`;

  return (
    `${GENERATED_FILE_BANNER}` +
    `import {\n` +
    `  normalizeDictionary,\n` +
    `  validateNormalizedDictionary,\n` +
    namespaceImport +
    `  toDictionary,\n` +
    `  type DictionarySpec,\n` +
    `  type NormalizedDictionary,\n` +
    `  type ValidationResult,\n` +
    `} from '@xndrjs/i18n/validation';\n` +
    `import type { ${schemaTypeName} } from './${typesModule}.js';\n\n` +
    `${dictionarySpecBlock}\n` +
    `export function normalizeExternalDictionary(\n` +
    `  input: unknown,\n` +
    `): ValidationResult<NormalizedDictionary> {\n` +
    `  return normalizeDictionary(input, DICTIONARY_SPEC);\n` +
    `}\n\n` +
    `export function validateNormalizedExternalDictionary(\n` +
    `  normalized: NormalizedDictionary,\n` +
    `): ValidationResult<NormalizedDictionary> {\n` +
    `  return validateNormalizedDictionary(normalized, DICTIONARY_SPEC);\n` +
    `}\n\n` +
    `export function validateExternalDictionary(\n` +
    `  input: unknown,\n` +
    `): ValidationResult<${schemaTypeName}> {\n` +
    `  const step1 = normalizeExternalDictionary(input);\n` +
    `  if (!step1.ok) {\n` +
    `    return step1;\n` +
    `  }\n\n` +
    `  const step2 = validateNormalizedExternalDictionary(step1.data);\n` +
    `  if (!step2.ok) {\n` +
    `    return step2;\n` +
    `  }\n\n` +
    `  return { ok: true, data: toDictionary(step2.data) as ${schemaTypeName} };\n` +
    `}\n\n` +
    namespaceValidator
  );
}

function main() {
  const configArgIndex = process.argv.indexOf("--config");
  const configPath = path.resolve(
    process.cwd(),
    configArgIndex >= 0 ? process.argv[configArgIndex + 1]! : "i18n.codegen.json"
  );
  const projectRoot = path.dirname(configPath);

  if (!fs.existsSync(configPath)) {
    fail(`[Codegen Error] Config file not found: ${configPath}`);
  }

  const config = loadConfig(configPath);
  const entries = resolveNamespaces(config);
  const isSingle = entries.length === 1;

  const typesOutputPath = path.resolve(projectRoot, config.typesOutput);
  const dictionaryOutputPath = path.resolve(projectRoot, config.dictionaryOutput);

  const paramsByNamespace: Record<string, Record<string, string>> = {};
  const argsSpecByNamespace: Record<string, Record<string, VariableSpec>> = {};
  const locales = new Set<string>();
  let hasErrors = false;

  for (const entry of entries) {
    const absolutePath = path.resolve(projectRoot, entry.filePath);

    if (!fs.existsSync(absolutePath)) {
      console.error(
        `[Codegen Error] Dictionary file not found for namespace "${entry.namespace}": ${absolutePath}`
      );
      hasErrors = true;
      continue;
    }

    const dictionary = JSON.parse(fs.readFileSync(absolutePath, "utf8")) as DictionaryJson;
    paramsByNamespace[entry.namespace] = {};
    argsSpecByNamespace[entry.namespace] = {};

    for (const [key, localesByKey] of Object.entries(dictionary)) {
      const variables: VariableSpec = {};

      for (const locale of Object.keys(localesByKey)) {
        locales.add(locale);
      }

      for (const [locale, template] of Object.entries(localesByKey)) {
        try {
          const ast = parse(template);
          const extracted = extractVariables(ast);
          Object.assign(variables, mergeVariableSpecs(variables, extracted));
        } catch (error) {
          hasErrors = true;
          const message = error instanceof Error ? error.message : String(error);
          console.error(
            `[Codegen Error] ICU syntax error — namespace "${entry.namespace}", key "${key}", locale "${locale}": ${message}`
          );
        }
      }

      paramsByNamespace[entry.namespace]![key] = paramsTypeForVariables(variables);
      argsSpecByNamespace[entry.namespace]![key] = variables;
    }
  }

  if (hasErrors) {
    process.exit(1);
  }

  if (config.localeFallback) {
    hasErrors = validateCodegenLocaleFallback(config.localeFallback, locales);
  }

  if (hasErrors) {
    process.exit(1);
  }

  const paramsTypeName = config.paramsTypeName;
  const schemaTypeName = config.schemaTypeName;
  const localeTypeName = config.localeTypeName ?? schemaTypeName.replace(/Schema$/, "Locale");
  const localeFallbackConstName = config.localeFallbackConstName ?? "LOCALE_FALLBACK";
  const localeFallbackTypeName = `${localeTypeName}Fallback`;
  const requestLocales = collectRequestLocales(locales, config.localeFallback);
  const requestLocaleUnion = [...requestLocales]
    .sort()
    .map((locale) => `'${locale}'`)
    .join(" | ");
  const localeBlock = requestLocaleUnion
    ? `${config.localeFallback ? formatLocaleFallbackBlock(config.localeFallback, localeFallbackConstName, localeFallbackTypeName) : ""}` +
      `export type ${localeTypeName} = ${requestLocaleUnion};\n\n`
    : "";

  let paramsBlock: string;
  let schemaBlock: string;

  if (isSingle) {
    const onlyNamespace = entries[0]!.namespace;
    const keyTypes = paramsByNamespace[onlyNamespace] ?? {};
    const paramsLines = Object.entries(keyTypes)
      .map(([key, type]) => `  ${key}: ${type};`)
      .join("\n");

    paramsBlock = `export type ${paramsTypeName} = {\n${paramsLines}\n};`;

    const importPath = toImportPath(
      typesOutputPath,
      path.resolve(projectRoot, entries[0]!.filePath)
    );
    schemaBlock = `export type ${schemaTypeName} = typeof import('${importPath}.json');`;
  } else {
    const namespaceBlocks = entries
      .map((entry) => {
        const keyTypes = paramsByNamespace[entry.namespace] ?? {};
        const lines = Object.entries(keyTypes)
          .map(([key, type]) => `    ${key}: ${type};`)
          .join("\n");
        return `  ${entry.namespace}: {\n${lines}\n  };`;
      })
      .join("\n");

    paramsBlock = `export type ${paramsTypeName} = {\n${namespaceBlocks}\n};`;

    const schemaLines = entries
      .map((entry) => {
        const importPath = toImportPath(typesOutputPath, path.resolve(projectRoot, entry.filePath));
        return `  ${entry.namespace}: typeof import('${importPath}.json');`;
      })
      .join("\n");

    schemaBlock = `export type ${schemaTypeName} = {\n${schemaLines}\n};`;
  }

  const typesContent =
    `${GENERATED_FILE_BANNER}` +
    `export const I18N_MODE = '${isSingle ? "single" : "multi"}' as const;\n\n` +
    `${localeBlock}` +
    `${paramsBlock}\n\n` +
    `${schemaBlock}\n`;

  fs.mkdirSync(path.dirname(typesOutputPath), { recursive: true });
  fs.writeFileSync(typesOutputPath, typesContent);

  let dictionaryContent: string;

  if (isSingle) {
    const entry = entries[0]!;
    const importPath = toImportPath(
      dictionaryOutputPath,
      path.resolve(projectRoot, entry.filePath)
    );
    const importId = toImportIdentifier(entry.namespace);

    dictionaryContent =
      `${GENERATED_FILE_BANNER}` +
      `import ${importId} from '${importPath}.json';\n` +
      `import type { ${schemaTypeName} } from './${toModuleBasename(typesOutputPath)}.js';\n\n` +
      `export const dictionary: ${schemaTypeName} = ${importId};\n`;
  } else {
    const imports = entries
      .map((entry) => {
        const importPath = toImportPath(
          dictionaryOutputPath,
          path.resolve(projectRoot, entry.filePath)
        );
        return `import ${toImportIdentifier(entry.namespace)} from '${importPath}.json';`;
      })
      .join("\n");

    const objectEntries = entries
      .map((entry) => `  ${entry.namespace}: ${toImportIdentifier(entry.namespace)},`)
      .join("\n");

    dictionaryContent =
      `${GENERATED_FILE_BANNER}` +
      `${imports}\n` +
      `import type { ${schemaTypeName} } from './${toModuleBasename(typesOutputPath)}.js';\n\n` +
      `export const dictionary: ${schemaTypeName} = {\n${objectEntries}\n};\n`;
  }

  fs.mkdirSync(path.dirname(dictionaryOutputPath), { recursive: true });
  fs.writeFileSync(dictionaryOutputPath, dictionaryContent);

  const instanceOutputPath = path.resolve(projectRoot, config.instanceOutput);
  const providerClass = isSingle ? "IcuTranslationProviderSingle" : "IcuTranslationProviderMulti";
  const typesModule = toModuleBasename(typesOutputPath);
  const dictionaryModule = toModuleBasename(dictionaryOutputPath);
  const factoryName = config.factoryName ?? "createI18n";
  const providerTypeArgs = config.localeFallback
    ? `${schemaTypeName}, ${paramsTypeName}, ${localeTypeName}, typeof ${localeFallbackConstName}`
    : `${schemaTypeName}, ${paramsTypeName}`;
  const providerOptions = config.localeFallback
    ? `, {\n    localeFallback: ${localeFallbackConstName},\n  }`
    : "";
  const fallbackImport = config.localeFallback
    ? `import { ${localeFallbackConstName}, type ${localeTypeName} } from './${typesModule}.js';\n`
    : "";

  const instanceContent =
    `${GENERATED_FILE_BANNER}` +
    `import { ${providerClass} } from '@xndrjs/i18n';\n` +
    `import { dictionary } from './${dictionaryModule}.js';\n` +
    `import type { ${paramsTypeName}, ${schemaTypeName} } from './${typesModule}.js';\n` +
    fallbackImport +
    `\n` +
    `export function ${factoryName}(\n` +
    `  initialDictionary: ${schemaTypeName} = dictionary,\n` +
    `) {\n` +
    `  return new ${providerClass}<${providerTypeArgs}>(initialDictionary${providerOptions});\n` +
    `}\n`;

  fs.mkdirSync(path.dirname(instanceOutputPath), { recursive: true });
  fs.writeFileSync(instanceOutputPath, instanceContent);

  const generatedFiles = [
    path.relative(projectRoot, typesOutputPath),
    path.relative(projectRoot, dictionaryOutputPath),
    path.relative(projectRoot, instanceOutputPath),
  ];

  if (config.dictionarySchemaOutput) {
    const dictionarySchemaOutputPath = path.resolve(projectRoot, config.dictionarySchemaOutput);
    const dictionarySpecBlock = formatDictionarySpecBlock(isSingle, entries, argsSpecByNamespace);
    const dictionarySchemaContent = formatDictionarySchemaFile(
      schemaTypeName,
      typesModule,
      isSingle,
      dictionarySpecBlock
    );

    fs.mkdirSync(path.dirname(dictionarySchemaOutputPath), { recursive: true });
    fs.writeFileSync(dictionarySchemaOutputPath, dictionarySchemaContent);
    generatedFiles.push(path.relative(projectRoot, dictionarySchemaOutputPath));
  }

  console.log(`✅ Generated: ${generatedFiles.join(", ")}`);
}

main();
