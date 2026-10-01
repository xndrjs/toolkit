/**
 * Multi-file orchestration: collect → compileWorkspace → analyze → compose.
 * No filesystem writes — callers (CLI) persist `code` when diagnostics are empty.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import type { Diagnostic } from "../../check";
import { isErrorDiagnostic } from "../../check";
import { collectZielFiles, type CollectZielFilesOptions } from "../collect/collect-ziel-files";
import { compileWorkspace } from "../compile-workspace";
import {
  composeGeneratedModule,
  type ComposeGeneratedModuleOptions,
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
  /** Generated TypeScript; empty when diagnostics are non-empty. */
  code: string;
  diagnostics: Diagnostic[];
  /** Absolute paths collected for this run (stable order). */
  files: string[];
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
 * a single module (resources + strategy builders + projectors when queries exist).
 *
 * On any diagnostics (syntax or semantic), `code` is `""` and nothing is written.
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
  const files = collectZielFiles(collectOptions);

  const sources = files.map((absPath) => ({
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
      code: "",
      diagnostics: syntaxDiagnostics,
      files,
    };
  }

  const diagnostics = [
    ...compilation.lowerDiagnostics.map(withOrigin),
    ...compilation.analysis.diagnostics,
  ];

  const errors = diagnostics.filter(isErrorDiagnostic);
  if (errors.length > 0) {
    return { code: "", diagnostics, files };
  }

  const { code } = composeGeneratedModule(compilation.analysis, {
    importFrom,
    registryTypeName,
    resourceTag,
  });
  return { code, diagnostics, files };
}

/** @deprecated Use {@link buildGeneratedModule}. */
export const buildResources = buildGeneratedModule;
