/**
 * Multi-file collect → parse → merge → check for the language server.
 * Prefers open editor buffers over disk; same collect rules as codegen
 * when a `naviql.config.*` is found. Without a config, validates only the
 * trigger document (no workspace-root glob).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadConfigFile } from "../cli/load-config";
import { analyzeProgram, type Diagnostic, type ResourceTable, type ScalarTable } from "../check";
import {
  collectNaviQlFiles,
  DEFAULT_NAVIQL_EXCLUDE,
  DEFAULT_NAVIQL_INCLUDE,
} from "../compile/collect/collect-naviql-files";
import type { NaviQlCodegenConfig } from "../compile/config/define-config";
import { isLowerDiagnostic } from "../compile/lower";
import { mergePrograms } from "../compile/merge-programs";
import { parseAndCheck } from "../compile/parse-and-check";
import type { Program } from "../ir";
import { findNaviQlConfigFile } from "./resolve-config-root";

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
  /** Whether a `naviql.config.*` scoped the collect (false = single-file fallback). */
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
 * Resolve collect scope: nearest `naviql.config.*` → project globs;
 * otherwise single-file only (never glob the workspace root).
 */
async function resolveCollectPlan(
  triggerUri: string,
  workspaceFolders: readonly string[]
): Promise<CollectPlan> {
  const triggerPath = uriToPath(triggerUri);
  const startDir = triggerPath ? dirname(triggerPath) : (workspaceFolders[0] ?? process.cwd());

  const configPath = findNaviQlConfigFile(startDir);
  if (configPath) {
    let config: NaviQlCodegenConfig;
    try {
      config = await loadConfigFile(configPath);
    } catch {
      const configDir = dirname(configPath);
      return {
        kind: "project",
        root: configDir,
        include: [...DEFAULT_NAVIQL_INCLUDE],
        exclude: [...DEFAULT_NAVIQL_EXCLUDE],
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
    return collectNaviQlFiles(plan);
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
 * Collect workspace `.naviql` files, parse each (preferring open buffers), merge
 * programs that parse cleanly, and run `analyzeProgram` once.
 *
 * Without a nearby `naviql.config.*`, only the trigger document is checked —
 * no workspace-root glob of every `.naviql` file.
 *
 * Files with `SYNTAX_ERROR` are excluded from the merge but their syntax
 * diagnostics are still published. Lower-phase diagnostics (fragments /
 * duplicate selected fields) are published per file. Semantic diagnostics from
 * the merged program are grouped by `span.uri` (fallback: `triggerUri`).
 *
 * When the merge succeeds, `result.semantic` carries the merged program plus
 * scalar/resource tables for the LSP snapshot cache.
 */
export async function validateWorkspace(
  options: WorkspaceValidateOptions
): Promise<WorkspaceValidateResult> {
  const { triggerUri, openSources, workspaceFolders } = options;
  const plan = await resolveCollectPlan(triggerUri, workspaceFolders);
  const files = filesForPlan(plan);

  const programs: Program[] = [];
  const byUri = new Map<string, Diagnostic[]>();
  const sourcesByUri = new Map<string, string>();

  for (const absPath of files) {
    const uri = pathToUri(absPath);
    const source = readSource(absPath, openSources);
    sourcesByUri.set(uri, source);
    const { program, diagnostics } = parseAndCheck(source, uri);
    const syntax = diagnostics.filter((d) => d.code === "SYNTAX_ERROR");
    if (syntax.length > 0) {
      pushByUri(byUri, uri, syntax);
      continue;
    }
    // Fragment / duplicate-field diagnostics from lower (not re-emitted by check).
    const lower = diagnostics.filter(isLowerDiagnostic);
    if (lower.length > 0) {
      pushByUri(byUri, uri, lower);
    }
    programs.push(program);
  }

  let semantic: WorkspaceSemanticResult | undefined;
  if (programs.length > 0) {
    const merged = mergePrograms(programs);
    const analysis = analyzeProgram(merged);
    semantic = {
      program: merged,
      scalars: analysis.scalars,
      resources: analysis.resources,
    };
    for (const diagnostic of analysis.diagnostics) {
      const uri = diagnostic.span?.uri ?? triggerUri;
      pushByUri(byUri, uri, [diagnostic]);
    }
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
