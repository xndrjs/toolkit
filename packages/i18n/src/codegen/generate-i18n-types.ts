import fs from "node:fs";
import path from "node:path";
import {
  loadConfig,
  resolveDeliveryOutputDir,
  resolveDictionaryOutputPath,
  resolveLoadOnInit,
  resolveNamespaces,
} from "./config.js";
import { formatDictionaryFile } from "./emit/dictionary-file.js";
import {
  formatDictionarySchemaFile,
  formatDictionarySpecBlock,
} from "./emit/dictionary-schema-file.js";
import { formatInstanceFile } from "./emit/instance-file.js";
import { formatNamespaceLoadersFile } from "./emit/namespace-loaders-file.js";
import { formatTypesFile } from "./emit/types-file.js";
import { analyzeDictionaries } from "./icu-analysis.js";
import { getDeliveryArtifactsIssues } from "./delivery-artifacts.js";
import { collectRequestLocales, getCodegenLocaleFallbackIssues } from "./locale-fallback.js";
import { enrichLocaleFallback } from "./locale-policy.js";
import { reportCodegenIssues, resolveImportExtension, toModuleBasename } from "./paths.js";
import { prepareDictionaryEntries } from "./read-dictionary.js";
import { writeFileIfChanged } from "./write-file-if-changed.js";

/**
 * Codegen CLI entry point. Pipeline:
 * config → analyze (ICU + types input) → validate locale/delivery policy →
 * prepare artifacts (YAML→JSON, split) → resolve lazy/eager → emit generated .ts files.
 */
function main() {
  const configArgIndex = process.argv.indexOf("--config");
  const configPath = path.resolve(
    process.cwd(),
    configArgIndex >= 0 ? process.argv[configArgIndex + 1]! : "i18n/i18n.codegen.json"
  );
  const projectRoot = path.dirname(configPath);

  if (!fs.existsSync(configPath)) {
    throw new Error(`[Codegen Error] Config file not found: ${configPath}`);
  }

  const config = loadConfig(configPath);
  const sourceEntries = resolveNamespaces(config);
  const deliveryOutputRelative = resolveDeliveryOutputDir(config);
  const delivery = config.delivery ?? "canonical";
  const isSingle = Boolean(config.dictionary);

  const analysisResult = analyzeDictionaries(projectRoot, sourceEntries);
  if (!analysisResult.ok) {
    process.exit(1);
  }

  const { paramsByNamespace, argsSpecByNamespace, locales, dictionariesByNamespace } =
    analysisResult.analysis;

  if (config.localeFallback) {
    const localeFallbackIssues = getCodegenLocaleFallbackIssues(config.localeFallback, locales);
    if (localeFallbackIssues.length > 0) {
      reportCodegenIssues(localeFallbackIssues);
      process.exit(1);
    }
  }

  const paramsTypeName = config.paramsTypeName;
  const schemaTypeName = config.schemaTypeName;
  const localeTypeName = config.localeTypeName ?? schemaTypeName.replace(/Schema$/, "Locale");
  const localeFallbackConstName = config.localeFallbackConstName ?? "LOCALE_FALLBACK";
  const localeFallbackTypeName = `${localeTypeName}Fallback`;
  const factoryName = config.factoryName ?? "createI18n";
  const importExtension = resolveImportExtension(config);

  const requestLocales = collectRequestLocales(locales, config.localeFallback);
  const requestLocalesList = [...requestLocales].sort();

  if (delivery === "custom" && config.deliveryArtifacts) {
    const deliveryArtifactsIssues = getDeliveryArtifactsIssues(
      config.deliveryArtifacts,
      requestLocales
    );
    if (deliveryArtifactsIssues.length > 0) {
      reportCodegenIssues(deliveryArtifactsIssues);
      process.exit(1);
    }
  }

  const {
    resolvedEntries: entries,
    splitPathsByNamespace,
    compiledFiles,
  } = prepareDictionaryEntries(projectRoot, sourceEntries, deliveryOutputRelative, {
    dictionariesByNamespace,
    delivery,
    localeFallback: config.localeFallback,
    requestLocales: delivery === "split-by-locale" ? requestLocalesList : undefined,
    deliveryArtifacts: delivery === "custom" ? config.deliveryArtifacts : undefined,
  });

  const { loadOnInitSet, lazyEntries, hasLazy } = resolveLoadOnInit(config, entries, isSingle);

  const typesOutputPath = path.resolve(projectRoot, config.typesOutput);
  const dictionaryOutputPath = path.resolve(projectRoot, resolveDictionaryOutputPath(config));
  const instanceOutputPath = path.resolve(projectRoot, config.instanceOutput);
  const typesModule = toModuleBasename(typesOutputPath);

  const requestLocaleUnion = requestLocalesList
    .sort()
    .map((locale) => `'${locale}'`)
    .join(" | ");

  const deliveryAreaNames =
    delivery === "custom" && config.deliveryArtifacts
      ? Object.keys(config.deliveryArtifacts).sort()
      : undefined;
  const deliveryAreaTypeName =
    delivery === "custom" ? schemaTypeName.replace(/Schema$/, "DeliveryArea") : undefined;
  const deliveryAreaUnion = deliveryAreaNames
    ? deliveryAreaNames.map((area) => `'${area}'`).join(" | ")
    : undefined;

  const eagerEntries = hasLazy
    ? entries.filter((entry) => loadOnInitSet.has(entry.namespace))
    : entries;

  const localeFallbackForEmit = config.localeFallback
    ? enrichLocaleFallback(locales, config.localeFallback)
    : undefined;

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
    localeFallback: localeFallbackForEmit,
    paramsByNamespace,
    requestLocaleUnion,
    ...(deliveryAreaTypeName && deliveryAreaUnion
      ? {
          deliveryAreaTypeName,
          deliveryAreaUnion,
          ...(delivery === "custom" && config.deliveryArtifacts
            ? { deliveryArtifacts: config.deliveryArtifacts }
            : {}),
        }
      : {}),
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
    localeTypeName,
    importExtension,
    delivery,
    splitPathsByNamespace,
    ...(delivery === "split-by-locale" ? { requestLocales: requestLocalesList } : {}),
    ...(delivery === "custom" && deliveryAreaTypeName && deliveryAreaNames
      ? { deliveryAreaTypeName, deliveryAreaNames }
      : {}),
  });

  const instanceContent = formatInstanceFile({
    isSingle,
    hasLazy,
    typesOutputPath,
    paramsTypeName,
    schemaTypeName,
    localeTypeName,
    localeFallbackConstName,
    factoryName,
    hasLocaleFallback: Boolean(config.localeFallback),
    hasLocaleType: Boolean(requestLocaleUnion),
    namespaceNames: entries.map((entry) => entry.namespace),
    importExtension,
    delivery,
  });

  writeFileIfChanged(typesOutputPath, typesContent);

  const generatedFiles = [
    path.relative(projectRoot, typesOutputPath),
    path.relative(projectRoot, instanceOutputPath),
  ];

  if (dictionaryContent !== null) {
    writeFileIfChanged(dictionaryOutputPath, dictionaryContent);
    generatedFiles.splice(1, 0, path.relative(projectRoot, dictionaryOutputPath));
  } else if (fs.existsSync(dictionaryOutputPath)) {
    fs.unlinkSync(dictionaryOutputPath);
  }

  writeFileIfChanged(instanceOutputPath, instanceContent);

  if (config.dictionarySchemaOutput) {
    const dictionarySchemaOutputPath = path.resolve(projectRoot, config.dictionarySchemaOutput);
    const dictionarySpecBlock = formatDictionarySpecBlock(isSingle, entries, argsSpecByNamespace);
    const dictionarySchemaContent = formatDictionarySchemaFile(
      schemaTypeName,
      typesModule,
      isSingle,
      dictionarySpecBlock,
      importExtension
    );

    writeFileIfChanged(dictionarySchemaOutputPath, dictionarySchemaContent);
    generatedFiles.push(path.relative(projectRoot, dictionarySchemaOutputPath));
  }

  if (hasLazy) {
    const namespaceLoadersOutputPath = path.resolve(
      projectRoot,
      config.namespaceLoadersOutput ??
        path.join(path.dirname(config.instanceOutput), "namespace-loaders.generated.ts")
    );
    const lazyEntriesWithPaths = lazyEntries.map((entry) => ({
      ...entry,
      absolutePath: path.resolve(projectRoot, entry.filePath),
    }));
    const namespaceLoadersContent = formatNamespaceLoadersFile({
      loadersOutputPath: namespaceLoadersOutputPath,
      lazyEntries: lazyEntriesWithPaths,
      schemaTypeName,
      paramsTypeName,
      localeTypeName,
      localeFallbackConstName,
      hasLocaleFallback: Boolean(config.localeFallback),
      typesModule,
      importExtension,
      projectRoot,
      isSingle,
      delivery,
      splitPathsByNamespace,
      ...(delivery === "split-by-locale" ? { requestLocales: requestLocalesList } : {}),
      ...(delivery === "custom" && deliveryAreaTypeName && deliveryAreaNames
        ? { deliveryAreaTypeName, deliveryAreaNames }
        : {}),
    });

    writeFileIfChanged(namespaceLoadersOutputPath, namespaceLoadersContent);
    generatedFiles.push(path.relative(projectRoot, namespaceLoadersOutputPath));
  }

  console.log(`✅ Generated: ${generatedFiles.join(", ")}`);
  if (compiledFiles.length > 0) {
    console.log(`✅ Compiled: ${compiledFiles.join(", ")}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
