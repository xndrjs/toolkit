/**
 * Multi-file orchestration: collect → parse/lower per file → merge → check → emit.
 * No filesystem writes — callers (CLI) persist `code` when diagnostics are empty.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { checkProgram, type Diagnostic } from "../../check";
import type { Program } from "../../ir";
import {
  collectNaviQlFiles,
  type CollectNaviQlFilesOptions,
} from "../collect/collect-naviql-files";
import { mergePrograms } from "../merge-programs";
import { parseAndCheck } from "../parse-and-check";
import {
  composeGeneratedModule,
  type ComposeGeneratedModuleOptions,
} from "./compose-generated-module";

export type BuildResourcesOptions = CollectNaviQlFilesOptions & ComposeGeneratedModuleOptions;

export type BuildResourcesResult = {
  /** Generated TypeScript; empty when diagnostics are non-empty. */
  code: string;
  diagnostics: Diagnostic[];
  /** Absolute paths collected for this run (stable order). */
  files: string[];
};

function withFileUri(diagnostic: Diagnostic, uri: string): Diagnostic {
  return {
    ...diagnostic,
    path: diagnostic.path ? `${uri}#${diagnostic.path}` : uri,
  };
}

/**
 * Collect `.naviql` files, parse/lower each, merge IR, check once, then emit
 * a single module (resources + strategy builders + projectors when queries exist).
 *
 * Per-file semantic diagnostics from `parseAndCheck` are ignored — only
 * `SYNTAX_ERROR` is kept from that phase so cross-file references work.
 * Semantic checking runs once on the merged program.
 *
 * On any diagnostics (syntax or semantic), `code` is `""` and nothing is written.
 */
export function buildResources(options: BuildResourcesOptions = {}): BuildResourcesResult {
  const { importFrom, registryTypeName, ...collectOptions } = options;
  const files = collectNaviQlFiles(collectOptions);

  const programs: Program[] = [];
  const syntaxDiagnostics: Diagnostic[] = [];

  for (const absPath of files) {
    const source = readFileSync(absPath, "utf8");
    const uri = pathToFileURL(absPath).href;
    const { program, diagnostics } = parseAndCheck(source, uri);

    const syntax = diagnostics.filter((d) => d.code === "SYNTAX_ERROR");
    if (syntax.length > 0) {
      syntaxDiagnostics.push(...syntax.map((d) => withFileUri(d, uri)));
      continue;
    }

    programs.push(program);
  }

  if (syntaxDiagnostics.length > 0) {
    return { code: "", diagnostics: syntaxDiagnostics, files };
  }

  const merged = mergePrograms(programs);
  const diagnostics = checkProgram(merged);

  if (diagnostics.length > 0) {
    return { code: "", diagnostics, files };
  }

  const { code } = composeGeneratedModule(merged, { importFrom, registryTypeName });
  return { code, diagnostics: [], files };
}
