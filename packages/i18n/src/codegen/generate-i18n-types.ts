import fs from "node:fs";
import path from "node:path";
import { loadConfig, resolveLoadOnInit, resolveNamespaces } from "./config.js";
import { formatDictionaryFile } from "./emit/dictionary-file.js";
import {
  formatDictionarySchemaFile,
  formatDictionarySpecBlock,
} from "./emit/dictionary-schema-file.js";
import { formatInstanceFile } from "./emit/instance-file.js";
import { formatNamespaceLoadersFile } from "./emit/namespace-loaders-file.js";
import { formatTypesFile } from "./emit/types-file.js";
import { analyzeDictionaries } from "./icu-analysis.js";
import { collectRequestLocales, validateCodegenLocaleFallback } from "./locale-fallback.js";
import { fail, toModuleBasename } from "./paths.js";

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
  const isSingle = Boolean(config.dictionary);
  const { loadOnInitSet, lazyEntries, hasLazy } = resolveLoadOnInit(config, entries, isSingle);

  if (hasLazy && !config.dictionarySchemaOutput) {
    fail(
      '[Codegen Error] Lazy namespaces require "dictionarySchemaOutput" for validateExternalNamespace.'
    );
  }

  const typesOutputPath = path.resolve(projectRoot, config.typesOutput);
  const dictionaryOutputPath = path.resolve(projectRoot, config.dictionaryOutput);
  const instanceOutputPath = path.resolve(projectRoot, config.instanceOutput);

  const analysisResult = analyzeDictionaries(projectRoot, entries);
  if (!analysisResult.ok) {
    process.exit(1);
  }

  const { paramsByNamespace, argsSpecByNamespace, locales } = analysisResult.analysis;

  if (config.localeFallback && validateCodegenLocaleFallback(config.localeFallback, locales)) {
    process.exit(1);
  }

  const paramsTypeName = config.paramsTypeName;
  const schemaTypeName = config.schemaTypeName;
  const localeTypeName = config.localeTypeName ?? schemaTypeName.replace(/Schema$/, "Locale");
  const localeFallbackConstName = config.localeFallbackConstName ?? "LOCALE_FALLBACK";
  const localeFallbackTypeName = `${localeTypeName}Fallback`;
  const factoryName = config.factoryName ?? "createI18n";
  const typesModule = toModuleBasename(typesOutputPath);

  const requestLocales = collectRequestLocales(locales, config.localeFallback);
  const requestLocaleUnion = [...requestLocales]
    .sort()
    .map((locale) => `'${locale}'`)
    .join(" | ");

  const eagerEntries = hasLazy
    ? entries.filter((entry) => loadOnInitSet.has(entry.namespace))
    : entries;

  const typesContent = formatTypesFile({
    isSingle,
    entries,
    projectRoot,
    typesOutputPath,
    paramsTypeName,
    schemaTypeName,
    localeTypeName,
    localeFallbackConstName,
    localeFallbackTypeName,
    localeFallback: config.localeFallback,
    paramsByNamespace,
    requestLocaleUnion,
    hasLazy,
    loadOnInitSet,
    lazyEntries,
  });

  const dictionaryContent = formatDictionaryFile({
    isSingle,
    hasLazy,
    entries,
    eagerEntries,
    projectRoot,
    dictionaryOutputPath,
    typesOutputPath,
    schemaTypeName,
  });

  const instanceContent = formatInstanceFile({
    isSingle,
    hasLazy,
    typesOutputPath,
    dictionaryOutputPath,
    paramsTypeName,
    schemaTypeName,
    localeTypeName,
    localeFallbackConstName,
    factoryName,
    hasLocaleFallback: Boolean(config.localeFallback),
  });

  fs.mkdirSync(path.dirname(typesOutputPath), { recursive: true });
  fs.writeFileSync(typesOutputPath, typesContent);

  fs.mkdirSync(path.dirname(dictionaryOutputPath), { recursive: true });
  fs.writeFileSync(dictionaryOutputPath, dictionaryContent);

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

  if (hasLazy) {
    const namespaceLoadersOutputPath = path.resolve(
      projectRoot,
      config.namespaceLoadersOutput ??
        path.join(path.dirname(config.instanceOutput), "namespace-loaders.generated.ts")
    );
    const dictionarySchemaOutputPath = path.resolve(projectRoot, config.dictionarySchemaOutput!);
    const lazyEntriesWithPaths = lazyEntries.map((entry) => ({
      ...entry,
      absolutePath: path.resolve(projectRoot, entry.filePath),
    }));
    const namespaceLoadersContent = formatNamespaceLoadersFile(
      namespaceLoadersOutputPath,
      lazyEntriesWithPaths,
      schemaTypeName,
      typesModule,
      toModuleBasename(dictionarySchemaOutputPath),
      toModuleBasename(instanceOutputPath),
      factoryName
    );

    fs.mkdirSync(path.dirname(namespaceLoadersOutputPath), { recursive: true });
    fs.writeFileSync(namespaceLoadersOutputPath, namespaceLoadersContent);
    generatedFiles.push(path.relative(projectRoot, namespaceLoadersOutputPath));
  }

  console.log(`✅ Generated: ${generatedFiles.join(", ")}`);
}

main();
