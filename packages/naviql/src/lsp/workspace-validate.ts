/**
 * Multi-file collect → parse → merge → check for the language server.
 * Prefers open editor buffers over disk; same collect rules as codegen.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadConfigFile } from "../cli/load-config";
import { checkProgram, type Diagnostic } from "../check";
import {
  collectNaviQlFiles,
  DEFAULT_NAVIQL_EXCLUDE,
  DEFAULT_NAVIQL_INCLUDE,
} from "../compile/collect/collect-naviql-files";
import type { NaviQlCodegenConfig } from "../compile/config/define-config";
import { mergePrograms } from "../compile/merge-programs";
import { parseAndCheck } from "../compile/parse-and-check";
import type { Program } from "../ir";
import { findNaviQlConfigFile } from "./resolve-config-root";

export type WorkspaceValidateOptions = {
  /** Document URI that triggered this run (fallback for diagnostics without span.uri). */
  triggerUri: string;
  /** Open editor buffers keyed by document URI. */
  openSources: ReadonlyMap<string, string>;
  /** Absolute workspace folder paths from the LSP client (fallback when no config). */
  workspaceFolders: readonly string[];
};

export type WorkspaceValidateResult = {
  /** Absolute paths collected for this run. */
  files: string[];
  /** Diagnostics grouped by document URI. */
  byUri: Map<string, Diagnostic[]>;
  /** Source text used for each URI (for offset → position mapping). */
  sourcesByUri: Map<string, string>;
  /** Config / collect root used. */
  root: string;
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

async function resolveCollectOptions(
  triggerUri: string,
  workspaceFolders: readonly string[]
): Promise<{ root: string; include?: string[]; exclude?: string[]; pathFilter?: string | RegExp }> {
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
        root: configDir,
        include: [...DEFAULT_NAVIQL_INCLUDE],
        exclude: [...DEFAULT_NAVIQL_EXCLUDE],
      };
    }
    const configDir = dirname(configPath);
    const root = config.root ? resolve(configDir, config.root) : configDir;
    return {
      root,
      include: config.include,
      exclude: config.exclude,
      pathFilter: config.pathFilter,
    };
  }

  const root = workspaceFolders[0] ?? startDir;
  return {
    root,
    include: [...DEFAULT_NAVIQL_INCLUDE],
    exclude: [...DEFAULT_NAVIQL_EXCLUDE],
  };
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
 * programs that parse cleanly, and run `checkProgram` once.
 *
 * Files with `SYNTAX_ERROR` are excluded from the merge but their syntax
 * diagnostics are still published. Semantic diagnostics are grouped by
 * `span.uri` (fallback: `triggerUri`).
 */
export async function validateWorkspace(
  options: WorkspaceValidateOptions
): Promise<WorkspaceValidateResult> {
  const { triggerUri, openSources, workspaceFolders } = options;
  const collect = await resolveCollectOptions(triggerUri, workspaceFolders);
  const files = collectNaviQlFiles(collect);

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
    programs.push(program);
  }

  if (programs.length > 0) {
    const merged = mergePrograms(programs);
    const semantic = checkProgram(merged);
    for (const diagnostic of semantic) {
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

  return { files, byUri, sourcesByUri, root: collect.root };
}
