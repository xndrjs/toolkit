import fs from "node:fs";
import path from "node:path";
import {
  loadConfig,
  resolveArtifactsPath,
  resolveCodegenPaths,
  resolveNamespaces,
} from "./config.js";
import type { CodegenConfig } from "./codegen-config-schema.js";
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
import {
  DEFAULT_IMPORT_EXTENSION,
  relativePosixPath,
  reportCodegenIssues,
  toModuleBasename,
} from "./paths.js";
import { prepareDictionaryEntries } from "./read-dictionary.js";
import { writeFileIfChanged } from "./write-file-if-changed.js";

export type RunCodegenInput =
  | string
  | {
      configPath?: string;
      config?: CodegenConfig;
      projectRoot?: string;
      /** When false, skip console.log summaries (default true). */
      log?: boolean;
    };

export interface RunCodegenResult {
  projectRoot: string;
  generatedFiles: string[];
  compiledFiles: string[];
}

function resolveRunCodegenInput(input?: RunCodegenInput): {
  projectRoot: string;
  config: CodegenConfig;
  log: boolean;
} {
  if (typeof input === "string" || input === undefined) {
    const configPath = path.resolve(
      process.cwd(),
      typeof input === "string" ? input : "i18n/i18n.codegen.json"
    );
    if (!fs.existsSync(configPath)) {
      throw new Error(`[Codegen Error] Config file not found: ${configPath}`);
    }
    return {
      projectRoot: path.dirname(configPath),
      config: loadConfig(configPath),
      log: true,
    };
  }

  const log = input.log !== false;

  if (input.config !== undefined) {
    const projectRoot = path.resolve(input.projectRoot ?? process.cwd());
    return { projectRoot, config: input.config, log };
  }

  const configPath = path.resolve(process.cwd(), input.configPath ?? "i18n/i18n.codegen.json");
  if (!fs.existsSync(configPath)) {
    throw new Error(`[Codegen Error] Config file not found: ${configPath}`);
  }
  return {
    projectRoot: path.dirname(configPath),
    config: loadConfig(configPath),
    log,
  };
}

/**
 * Full codegen pipeline: types + instance + loaders + delivery JSON (+ schema).
 * Run at build time or when the *contract* changes (keys, params, namespaces, locales).
 * Content-only refreshes (same ICU contract) should use {@link regenerateNamespaces} instead.
 */
export function runCodegen(input?: RunCodegenInput): RunCodegenResult {
  const { projectRoot, config, log } = resolveRunCodegenInput(input);
  const sourceEntries = resolveNamespaces(config);
  const artifactsPathRelative = resolveArtifactsPath(config);
  const delivery = config.delivery ?? "split-by-locale";
  const loaderStrategy = config.loaderStrategy ?? "import";

  const analysisResult = analyzeDictionaries(projectRoot, sourceEntries);
  if (!analysisResult.ok) {
    throw new Error("[Codegen Error] Dictionary ICU analysis failed. See messages above.");
  }

  const { paramsByNamespace, argsSpecByNamespace, locales, dictionariesByNamespace } =
    analysisResult.analysis;

  if (config.localeFallback) {
    const localeFallbackIssues = getCodegenLocaleFallbackIssues(config.localeFallback, locales);
    if (localeFallbackIssues.length > 0) {
      reportCodegenIssues(localeFallbackIssues);
      throw new Error("[Codegen Error] Invalid localeFallback configuration.");
    }
  }

  const paths = resolveCodegenPaths(config);
  const {
    paramsTypeName,
    schemaTypeName,
    localeTypeName,
    localeFallbackConstName,
    factoryName,
    deliveryAreaTypeName: resolvedDeliveryAreaTypeName,
  } = paths;
  const localeFallbackTypeName = `${localeTypeName}Fallback`;
  const importExtension = DEFAULT_IMPORT_EXTENSION;

  const requestLocales = collectRequestLocales(locales, config.localeFallback);
  const requestLocalesList = [...requestLocales].sort();

  if (delivery === "custom" && config.deliveryArtifacts) {
    const deliveryArtifactsIssues = getDeliveryArtifactsIssues(
      config.deliveryArtifacts,
      requestLocales
    );
    if (deliveryArtifactsIssues.length > 0) {
      reportCodegenIssues(deliveryArtifactsIssues);
      throw new Error("[Codegen Error] Invalid deliveryArtifacts configuration.");
    }
  }

  const {
    resolvedEntries: entries,
    splitPathsByNamespace,
    compiledFiles,
  } = prepareDictionaryEntries(projectRoot, sourceEntries, artifactsPathRelative, {
    dictionariesByNamespace,
    delivery,
    localeFallback: config.localeFallback,
    requestLocales: delivery === "split-by-locale" ? requestLocalesList : undefined,
    deliveryArtifacts: delivery === "custom" ? config.deliveryArtifacts : undefined,
  });

  const typesOutputPath = path.resolve(projectRoot, paths.typesOutput);
  const instanceOutputPath = path.resolve(projectRoot, paths.instanceOutput);
  const namespaceLoadersOutputPath = path.resolve(projectRoot, paths.namespaceLoadersOutput);
  const dictionarySchemaOutputPath = path.resolve(projectRoot, paths.dictionarySchemaOutput);
  const typesModule = toModuleBasename(typesOutputPath);

  const deliveryAreaNames =
    delivery === "custom" && config.deliveryArtifacts
      ? Object.keys(config.deliveryArtifacts).sort()
      : undefined;
  const deliveryAreaTypeName = delivery === "custom" ? resolvedDeliveryAreaTypeName : undefined;

  const localeFallbackForEmit = config.localeFallback
    ? enrichLocaleFallback(locales, config.localeFallback)
    : undefined;

  const typesContent = formatTypesFile({
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
    requestLocales: requestLocalesList,
    ...(deliveryAreaTypeName && deliveryAreaNames
      ? {
          deliveryAreaTypeName,
          deliveryAreaNames,
          ...(delivery === "custom" && config.deliveryArtifacts
            ? { deliveryArtifacts: config.deliveryArtifacts }
            : {}),
        }
      : {}),
    lazyEntries: entries,
  });

  const instanceContent = formatInstanceFile({
    typesOutputPath,
    namespaceLoadersOutputPath,
    paramsTypeName,
    schemaTypeName,
    localeTypeName,
    localeFallbackConstName,
    factoryName,
    hasLocaleFallback: Boolean(config.localeFallback),
    hasLocaleType: requestLocalesList.length > 0,
    importExtension,
    delivery,
    loaderStrategy,
    ...(delivery === "custom" ? { localeDeliveryAreaConstName: "LOCALE_DELIVERY_AREA" } : {}),
  });

  writeFileIfChanged(typesOutputPath, typesContent);

  const generatedFiles = [
    relativePosixPath(projectRoot, typesOutputPath),
    relativePosixPath(projectRoot, instanceOutputPath),
  ];

  writeFileIfChanged(instanceOutputPath, instanceContent);

  const dictionarySpecBlock = formatDictionarySpecBlock(entries, argsSpecByNamespace);
  const dictionarySchemaContent = formatDictionarySchemaFile(
    schemaTypeName,
    typesModule,
    dictionarySpecBlock,
    importExtension
  );
  writeFileIfChanged(dictionarySchemaOutputPath, dictionarySchemaContent);
  generatedFiles.push(relativePosixPath(projectRoot, dictionarySchemaOutputPath));

  const lazyEntriesWithPaths = entries.map((entry) => ({
    ...entry,
    absolutePath: path.resolve(projectRoot, entry.filePath),
  }));
  const namespaceLoadersContent = formatNamespaceLoadersFile({
    loadersOutputPath: namespaceLoadersOutputPath,
    lazyEntries: lazyEntriesWithPaths,
    schemaTypeName,
    localeTypeName,
    typesModule,
    importExtension,
    projectRoot,
    delivery,
    splitPathsByNamespace,
    loaderStrategy,
    ...(delivery === "split-by-locale" ? { requestLocales: requestLocalesList } : {}),
    ...(delivery === "custom" && deliveryAreaTypeName && deliveryAreaNames
      ? { deliveryAreaTypeName, deliveryAreaNames }
      : {}),
  });

  writeFileIfChanged(namespaceLoadersOutputPath, namespaceLoadersContent);
  generatedFiles.push(relativePosixPath(projectRoot, namespaceLoadersOutputPath));

  if (log) {
    console.log(`✅ Generated: ${generatedFiles.join(", ")}`);
    if (compiledFiles.length > 0) {
      console.log(`✅ Compiled: ${compiledFiles.join(", ")}`);
    }
  }

  return { projectRoot, generatedFiles, compiledFiles };
}
