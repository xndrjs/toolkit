/**
 * Multi-file orchestration: collect → compileWorkspace → analyze → compose.
 * No filesystem writes — callers (CLI) persist `files` when diagnostics are empty.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import type { Diagnostic } from "../../check";
import { isErrorDiagnostic } from "../../check";
import { collectZielFiles, type CollectZielFilesOptions } from "../collect/collect-ziel-files";
import { compileWorkspace } from "../compile-workspace";
import {
  composeGeneratedModules,
  type ComposeGeneratedModuleOptions,
  type GeneratedModuleFile,
} from "./compose-generated-module";

export type BuildGeneratedModuleOptions = CollectZielFilesOptions &
  ComposeGeneratedModuleOptions & {
    /**
     * When the program declares ≥1 datasource, require every resource to appear
     * in at least one `for` route. Default: `true`.
     */
    requireDatasourceCoverage?: boolean;
  };

export type BuildGeneratedModuleResult = {
  /**
   * Generated modules relative to `out` (`resources.ts`, `*.query.ts`).
   * Empty when diagnostics contain errors.
   */
  files: GeneratedModuleFile[];
  diagnostics: Diagnostic[];
  /** Absolute `.ziel` paths collected for this run (stable order). */
  sourceFiles: string[];
};

/** @deprecated Use {@link BuildGeneratedModuleOptions}. */
export type BuildResourcesOptions = BuildGeneratedModuleOptions;

/** @deprecated Use {@link BuildGeneratedModuleResult}. */
export type BuildResourcesResult = BuildGeneratedModuleResult;

function withFileUri(diagnostic: Diagnostic, uri: string): Diagnostic {
  return {
    ...diagnostic,
    path: diagnostic.path ? `${uri}#${diagnostic.path}` : uri,
  };
}

/**
 * Collect `.ziel` files, parse them, lower against one global workspace, then emit
 * the multi-file product (resources + per-query modules).
 *
 * On any diagnostics (syntax or semantic), `files` is `[]` and nothing is written.
 */
export function buildGeneratedModule(
  options: BuildGeneratedModuleOptions = {}
): BuildGeneratedModuleResult {
  const {
    importFrom,
    registryTypeName,
    resourceTag,
    requireDatasourceCoverage,
    ...collectOptions
  } = options;
  const sourceFiles = collectZielFiles(collectOptions);

  const sources = sourceFiles.map((absPath) => ({
    source: readFileSync(absPath, "utf8"),
    uri: pathToFileURL(absPath).href,
  }));
  const compilation = compileWorkspace(sources, { requireDatasourceCoverage });
  const withOrigin = (diagnostic: Diagnostic): Diagnostic => {
    const uri = diagnostic.span?.uri;
    return uri ? withFileUri(diagnostic, uri) : diagnostic;
  };
  const syntaxDiagnostics = compilation.syntaxDiagnostics.map(withOrigin);

  if (syntaxDiagnostics.length > 0) {
    return {
      files: [],
      diagnostics: syntaxDiagnostics,
      sourceFiles,
    };
  }

  const diagnostics = [
    ...compilation.lowerDiagnostics.map(withOrigin),
    ...compilation.analysis.diagnostics,
  ];

  const errors = diagnostics.filter(isErrorDiagnostic);
  if (errors.length > 0) {
    return { files: [], diagnostics, sourceFiles };
  }

  const { files } = composeGeneratedModules(compilation.analysis, {
    importFrom,
    registryTypeName,
    resourceTag,
  });
  return { files, diagnostics, sourceFiles };
}

/** @deprecated Use {@link buildGeneratedModule}. */
export const buildResources = buildGeneratedModule;
