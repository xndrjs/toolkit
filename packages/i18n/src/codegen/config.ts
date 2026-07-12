import fs from "node:fs";
import type { LoadOnInitResolution, NamespaceEntry } from "./types.js";
import {
  CodegenConfig,
  codegenConfigSchema,
  formatCodegenConfigIssues,
} from "./codegen-config-schema.js";

export { resolveDeliveryOutputDir, resolveDictionaryOutputPath } from "./codegen-config-schema.js";

/** Parses and validates `i18n.codegen.json`; first step of the codegen pipeline. */
export function loadConfig(configPath: string): CodegenConfig {
  let raw: unknown;

  try {
    raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[Codegen Error] Failed to parse config JSON (${configPath}): ${message}`);
  }

  const result = codegenConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(formatCodegenConfigIssues(result.error));
  }

  return result.data;
}

/** Maps config to namespace entries (`dictionary` single vs `namespaces` multi). */
export function resolveNamespaces(config: CodegenConfig): NamespaceEntry[] {
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

/**
 * Splits namespaces into eager (`loadOnInit`) and lazy sets.
 * Drives `InitialSchema`, `defaultDictionary`, and `namespace-loaders.generated.ts`.
 */
export function resolveLoadOnInit(
  config: CodegenConfig,
  entries: NamespaceEntry[],
  isSingle: boolean
): LoadOnInitResolution {
  if (isSingle) {
    if (config.loadOnInit) {
      throw new Error(
        '[Codegen Error] "loadOnInit" is only supported in multi mode (namespaces config).'
      );
    }
    const all = new Set(entries.map((entry) => entry.namespace));
    return { loadOnInitSet: all, lazyEntries: [], hasLazy: false };
  }

  const delivery = config.delivery ?? "canonical";
  if (delivery !== "canonical") {
    return {
      loadOnInitSet: new Set(),
      lazyEntries: entries,
      hasLazy: entries.length > 0,
    };
  }

  const allNamespaces = new Set(entries.map((entry) => entry.namespace));
  const loadOnInitSet = config.loadOnInit
    ? new Set(config.loadOnInit)
    : new Set(entries.map((entry) => entry.namespace));

  for (const namespace of loadOnInitSet) {
    if (!allNamespaces.has(namespace)) {
      throw new Error(
        `[Codegen Error] loadOnInit: namespace "${namespace}" is not defined in namespaces config.`
      );
    }
  }

  const lazyEntries = entries.filter((entry) => !loadOnInitSet.has(entry.namespace));
  return { loadOnInitSet, lazyEntries, hasLazy: lazyEntries.length > 0 };
}
