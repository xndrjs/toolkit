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
import { isLowerDiagnostic } from "../lower";
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
 * `SYNTAX_ERROR` and lower-time fragment diagnostics are kept from that phase
 * so cross-file references work. Semantic checking runs once on the merged
 * program.
 *
 * On any diagnostics (syntax or semantic), `code` is `""` and nothing is written.
 */
export function buildResources(options: BuildResourcesOptions = {}): BuildResourcesResult {
  const { importFrom, registryTypeName, ...collectOptions } = options;
  const files = collectNaviQlFiles(collectOptions);

  const programs: Program[] = [];
  const perFileDiagnostics: Diagnostic[] = [];

  for (const absPath of files) {
    const source = readFileSync(absPath, "utf8");
    const uri = pathToFileURL(absPath).href;
    const { program, diagnostics } = parseAndCheck(source, uri);

    // Keep syntax errors and lower-time fragment diagnostics; drop other
    // per-file semantic errors so cross-file refs work until merge+check.
    const preserved = diagnostics.filter((d) => d.code === "SYNTAX_ERROR" || isLowerDiagnostic(d));
    if (preserved.length > 0) {
      perFileDiagnostics.push(...preserved.map((d) => withFileUri(d, uri)));
    }

    if (preserved.some((d) => d.code === "SYNTAX_ERROR")) {
      continue;
    }

    programs.push(program);
  }

  if (perFileDiagnostics.some((d) => d.code === "SYNTAX_ERROR")) {
    return {
      code: "",
      diagnostics: perFileDiagnostics.filter((d) => d.code === "SYNTAX_ERROR"),
      files,
    };
  }

  const merged = mergePrograms(programs);
  const diagnostics = [...perFileDiagnostics, ...checkProgram(merged)];

  if (diagnostics.length > 0) {
    return { code: "", diagnostics, files };
  }

  const { code } = composeGeneratedModule(merged, { importFrom, registryTypeName });
  return { code, diagnostics: [], files };
}
