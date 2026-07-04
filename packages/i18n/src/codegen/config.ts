import fs from "node:fs";
import type { CodegenConfig, LoadOnInitResolution, NamespaceEntry } from "./types.js";
import { fail } from "./paths.js";

export function loadConfig(configPath: string): CodegenConfig {
  const raw = fs.readFileSync(configPath, "utf8");
  return JSON.parse(raw) as CodegenConfig;
}

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

export function resolveLoadOnInit(
  config: CodegenConfig,
  entries: NamespaceEntry[],
  isSingle: boolean
): LoadOnInitResolution {
  if (isSingle) {
    if (config.loadOnInit) {
      fail('[Codegen Error] "loadOnInit" is only supported in multi mode (namespaces config).');
    }
    const all = new Set(entries.map((entry) => entry.namespace));
    return { loadOnInitSet: all, lazyEntries: [], hasLazy: false };
  }

  const allNamespaces = new Set(entries.map((entry) => entry.namespace));
  const loadOnInitSet = config.loadOnInit
    ? new Set(config.loadOnInit)
    : new Set(entries.map((entry) => entry.namespace));

  for (const namespace of loadOnInitSet) {
    if (!allNamespaces.has(namespace)) {
      fail(
        `[Codegen Error] loadOnInit: namespace "${namespace}" is not defined in namespaces config.`
      );
    }
  }

  const lazyEntries = entries.filter((entry) => !loadOnInitSet.has(entry.namespace));
  return { loadOnInitSet, lazyEntries, hasLazy: lazyEntries.length > 0 };
}
