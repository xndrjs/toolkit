/**
 * Multi-file collect → parse workspace → global lower/check for the language server.
 * Prefers open editor buffers over disk; same collect rules as codegen
 * when a `ziel.config.*` is found. Without a config, validates only the
 * trigger document (no workspace-root glob).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadConfigFile } from "../cli/load-config";
import type { Diagnostic, OpaqueTable, ResourceTable, ScalarTable } from "../check";
import { compileWorkspace, type WorkspaceSource } from "../compile/compile-workspace";
import {
  collectZielFiles,
  DEFAULT_ZIEL_EXCLUDE,
  DEFAULT_ZIEL_INCLUDE,
} from "../compile/collect/collect-ziel-files";
import type { ZielCodegenConfig } from "../compile/config/define-config";
import type { Program } from "../ir";
import { findZielConfigFile } from "./resolve-config-root";

export type WorkspaceValidateOptions = {
  /** Document URI that triggered this run (fallback for diagnostics without span.uri). */
  triggerUri: string;
  /** Open editor buffers keyed by document URI. */
  openSources: ReadonlyMap<string, string>;
  /** Absolute workspace folder paths from the LSP client (config walk seed only). */
  workspaceFolders: readonly string[];
};

/** Merged program + tables when at least one file lowered cleanly. */
export type WorkspaceSemanticResult = {
  program: Program;
  scalars: ScalarTable;
  opaques: OpaqueTable;
  resources: ResourceTable;
};

export type WorkspaceValidateResult = {
  /** Absolute paths collected for this run. */
  files: string[];
  /** Diagnostics grouped by document URI. */
  byUri: Map<string, Diagnostic[]>;
  /** Source text used for each URI (for offset → position mapping). */
  sourcesByUri: Map<string, string>;
  /** Config / collect root used (config dir, or trigger file dir in single-file mode). */
  root: string;
  /** Whether a `ziel.config.*` scoped the collect (false = single-file fallback). */
  usedConfig: boolean;
  /**
   * Semantic snapshot inputs for IntelliSense providers.
   * `undefined` when every collected file failed to parse (nothing to merge).
   */
  semantic: WorkspaceSemanticResult | undefined;
};

type CollectPlan =
  | {
      kind: "project";
      root: string;
      include?: string[];
      exclude?: string[];
      pathFilter?: string | RegExp;
      requireDatasourceCoverage?: boolean;
    }
  | {
      kind: "single-file";
      root: string;
      /** Absolute path of the only file to validate; null when trigger has no path. */
      file: string | null;
    };

function isFileUri(uri: string): boolean {
  return uri.startsWith("file:");
}

function uriToPath(uri: string): string | undefined {
  if (!isFileUri(uri)) {
    return undefined;
  }
  try {
    return fileURLToPath(uri);
  } catch {
    return undefined;
  }
}

function pathToUri(absPath: string): string {
  return pathToFileURL(absPath).href;
}

function readSource(absPath: string, openSources: ReadonlyMap<string, string>): string {
  const uri = pathToUri(absPath);
  const fromOpen = openSources.get(uri);
  if (fromOpen !== undefined) {
    return fromOpen;
  }
  return readFileSync(absPath, "utf8");
}

/**
 * Resolve collect scope: nearest `ziel.config.*` → project globs;
 * otherwise single-file only (never glob the workspace root).
 */
async function resolveCollectPlan(
  triggerUri: string,
  workspaceFolders: readonly string[]
): Promise<CollectPlan> {
  const triggerPath = uriToPath(triggerUri);
  const startDir = triggerPath ? dirname(triggerPath) : (workspaceFolders[0] ?? process.cwd());

  const configPath = findZielConfigFile(startDir);
  if (configPath) {
    let config: ZielCodegenConfig;
    try {
      config = await loadConfigFile(configPath);
    } catch {
      const configDir = dirname(configPath);
      return {
        kind: "project",
        root: configDir,
        include: [...DEFAULT_ZIEL_INCLUDE],
        exclude: [...DEFAULT_ZIEL_EXCLUDE],
      };
    }
    const configDir = dirname(configPath);
    const root = config.root ? resolve(configDir, config.root) : configDir;
    return {
      kind: "project",
      root,
      include: config.include,
      exclude: config.exclude,
      pathFilter: config.pathFilter,
      requireDatasourceCoverage: config.requireDatasourceCoverage,
    };
  }

  return {
    kind: "single-file",
    root: startDir,
    file: triggerPath ?? null,
  };
}

function filesForPlan(plan: CollectPlan): string[] {
  if (plan.kind === "project") {
    return collectZielFiles(plan);
  }
  return plan.file !== null ? [plan.file] : [];
}

function pushByUri(byUri: Map<string, Diagnostic[]>, uri: string, diagnostics: Diagnostic[]): void {
  if (diagnostics.length === 0) {
    return;
  }
  const existing = byUri.get(uri);
  if (existing) {
    existing.push(...diagnostics);
  } else {
    byUri.set(uri, [...diagnostics]);
  }
}

/**
 * Collect workspace `.ziel` files, parse each (preferring open buffers), lower
 * all valid ASTs against global symbols, and run `analyzeProgram` once.
 *
 * Without a nearby `ziel.config.*`, only the trigger document is checked —
 * no workspace-root glob of every `.ziel` file.
 *
 * Files with `SYNTAX_ERROR` are excluded from lowering but their diagnostics are
 * still published. Every diagnostic is grouped by `span.uri` (fallback:
 * `triggerUri`).
 *
 * When lowering succeeds, `result.semantic` carries the workspace program plus
 * scalar/opaque/resource tables for the LSP snapshot cache.
 */
export async function validateWorkspace(
  options: WorkspaceValidateOptions
): Promise<WorkspaceValidateResult> {
  const { triggerUri, openSources, workspaceFolders } = options;
  const plan = await resolveCollectPlan(triggerUri, workspaceFolders);
  const files = filesForPlan(plan);

  const byUri = new Map<string, Diagnostic[]>();
  const sourcesByUri = new Map<string, string>();
  const sources: WorkspaceSource[] = [];

  for (const absPath of files) {
    const uri = pathToUri(absPath);
    const source = readSource(absPath, openSources);
    sourcesByUri.set(uri, source);
    sources.push({ uri, source });
  }

  const compilation = compileWorkspace(sources, {
    requireDatasourceCoverage: plan.kind === "project" ? plan.requireDatasourceCoverage : undefined,
  });

  for (const diagnostic of compilation.diagnostics) {
    const uri = diagnostic.span?.uri ?? triggerUri;
    pushByUri(byUri, uri, [diagnostic]);
  }

  let semantic: WorkspaceSemanticResult | undefined;
  if (compilation.validSourceCount > 0) {
    semantic = {
      program: compilation.program,
      scalars: compilation.analysis.scalars,
      opaques: compilation.analysis.opaques,
      resources: compilation.analysis.resources,
    };
  }

  // Ensure every collected file has an entry (empty = clear previous squiggles).
  for (const absPath of files) {
    const uri = pathToUri(absPath);
    if (!byUri.has(uri)) {
      byUri.set(uri, []);
    }
  }

  return {
    files,
    byUri,
    sourcesByUri,
    root: plan.root,
    usedConfig: plan.kind === "project",
    semantic,
  };
}
