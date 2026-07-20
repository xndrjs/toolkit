import fs from "node:fs";
import path from "node:path";
import type { CodegenConfig } from "./codegen-config-schema.js";
import {
  loadConfig,
  resolveArtifactsPath,
  resolveCodegenPaths,
  resolveNamespaces,
} from "./config.js";
import { getDeliveryArtifactsIssues } from "./delivery-artifacts.js";
import {
  buildDictionarySpecFromAnalysis,
  loadDictionarySpecFromSchemaFile,
  namespaceContractsMatch,
} from "./dictionary-spec-contract.js";
import { analyzeDictionaries } from "./icu-analysis.js";
import { collectRequestLocales, getCodegenLocaleFallbackIssues } from "./locale-fallback.js";
import { reportCodegenIssues } from "./paths.js";
import { prepareDictionaryEntries } from "./read-dictionary.js";
import type { DictionaryJson } from "./types.js";

export interface RegenerateNamespacesInput {
  /** Namespaces whose delivery JSON should be refreshed from authoring sources. */
  namespaces: readonly string[];
  configPath?: string;
  config?: CodegenConfig;
  projectRoot?: string;
  /** When false, skip console.log summaries (default true). */
  log?: boolean;
}

export interface RegenerateNamespacesResult {
  projectRoot: string;
  compiledFiles: string[];
  splitPathsByNamespace: Record<string, Record<string, string>>;
}

function resolveRegenerateInput(input: RegenerateNamespacesInput): {
  projectRoot: string;
  config: CodegenConfig;
  namespaces: readonly string[];
  log: boolean;
} {
  const log = input.log !== false;
  const namespaces = input.namespaces;

  if (input.config !== undefined) {
    return {
      projectRoot: path.resolve(input.projectRoot ?? process.cwd()),
      config: input.config,
      namespaces,
      log,
    };
  }

  const configPath = path.resolve(process.cwd(), input.configPath ?? "i18n/i18n.codegen.json");
  if (!fs.existsSync(configPath)) {
    throw new Error(`[Codegen Error] Config file not found: ${configPath}`);
  }
  return {
    projectRoot: path.dirname(configPath),
    config: loadConfig(configPath),
    namespaces,
    log,
  };
}

/**
 * Content-only refresh: re-materialize delivery JSON for selected namespaces from
 * current authoring files, without rewriting generated TypeScript.
 *
 * Must not change the ICU key/param contract established by a prior {@link runCodegen}.
 * If authoring changed keys or ICU args, this throws — run {@link runCodegen} and ship a release.
 *
 * Authoring updates are out of scope for this library (CMS or editors write those files).
 * End-to-end without app rebuild requires `loaderStrategy: "fetch"`.
 */
export function regenerateNamespaces(input: RegenerateNamespacesInput): RegenerateNamespacesResult {
  const { projectRoot, config, namespaces, log } = resolveRegenerateInput(input);

  if (namespaces.length === 0) {
    throw new Error("[Codegen Error] regenerateNamespaces requires a non-empty namespaces list.");
  }

  const sourceEntries = resolveNamespaces(config);
  const known = new Set(sourceEntries.map((entry) => entry.namespace));
  const unknown = namespaces.filter((namespace) => !known.has(namespace));
  if (unknown.length > 0) {
    throw new Error(
      `[Codegen Error] Unknown namespace(s) for regenerateNamespaces: ${unknown.join(", ")}.`
    );
  }

  const requested = new Set(namespaces);
  const selectedEntries = sourceEntries.filter((entry) => requested.has(entry.namespace));

  const paths = resolveCodegenPaths(config);
  const schemaPath = path.resolve(projectRoot, paths.dictionarySchemaOutput);
  const established = loadDictionarySpecFromSchemaFile(schemaPath);

  const artifactsPathRelative = resolveArtifactsPath(config);
  const delivery = config.delivery ?? "split-by-locale";

  // Analyze all namespaces so locale unions / deliveryArtifacts stay consistent with full codegen.
  const analysisResult = analyzeDictionaries(projectRoot, sourceEntries);
  if (!analysisResult.ok) {
    throw new Error(
      "[Codegen Error] Dictionary ICU analysis failed while regenerating namespaces."
    );
  }

  const {
    argsSpecByNamespace,
    locales,
    dictionariesByNamespace: sourceDictionaries,
  } = analysisResult.analysis;

  const current = buildDictionarySpecFromAnalysis(selectedEntries, argsSpecByNamespace);
  if (!namespaceContractsMatch(namespaces, current, established)) {
    throw new Error(
      "[Codegen Error] Namespace ICU contract changed (keys or params). Contract change requires runCodegen."
    );
  }

  if (config.localeFallback) {
    const localeFallbackIssues = getCodegenLocaleFallbackIssues(config.localeFallback, locales);
    if (localeFallbackIssues.length > 0) {
      reportCodegenIssues(localeFallbackIssues);
      throw new Error("[Codegen Error] Invalid localeFallback configuration.");
    }
  }

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

  const dictionariesByNamespace: Record<string, DictionaryJson> = {};
  for (const entry of selectedEntries) {
    const dictionary = sourceDictionaries[entry.namespace];
    if (!dictionary) {
      throw new Error(
        `[Codegen Error] Missing parsed dictionary for namespace "${entry.namespace}".`
      );
    }
    dictionariesByNamespace[entry.namespace] = dictionary;
  }

  const { splitPathsByNamespace, compiledFiles } = prepareDictionaryEntries(
    projectRoot,
    selectedEntries,
    artifactsPathRelative,
    {
      dictionariesByNamespace,
      delivery,
      localeFallback: config.localeFallback,
      requestLocales: delivery === "split-by-locale" ? requestLocalesList : undefined,
      deliveryArtifacts: delivery === "custom" ? config.deliveryArtifacts : undefined,
    }
  );

  if (log) {
    if (compiledFiles.length > 0) {
      console.log(`✅ Regenerated delivery artifacts: ${compiledFiles.join(", ")}`);
    } else {
      console.log("✅ Regenerated delivery artifacts: unchanged");
    }
  }

  return { projectRoot, compiledFiles, splitPathsByNamespace };
}
