import type { Program } from "../ir";
import { checkDatasources } from "./check-datasources";
import { checkFragment } from "./check-fragment";
import { checkQuery } from "./check-query";
import { collectResources, collectScalars } from "./collect";
import { createDiagnosticSink, type Diagnostic } from "./diagnostic";
import type { ResourceTable, ScalarTable } from "./symbols";
import { buildQueryPlans, type QueryPlan } from "./program-analysis";

export type ProgramAnalysis = {
  readonly program: Program;
  readonly diagnostics: readonly Diagnostic[];
  readonly scalars: ScalarTable;
  readonly resources: ResourceTable;
  readonly queries: readonly QueryPlan[];
};

/** Options for {@link analyzeProgram} / {@link checkProgram}. */
export type AnalyzeProgramOptions = {
  /**
   * When the program declares ≥1 datasource, require every resource to appear
   * in at least one `for` route. Default: `true`.
   */
  requireDatasourceCoverage?: boolean;
};

/**
 * Collect scalar/resource tables and run semantic checks.
 * Prefer this when callers need the tables (e.g. LSP snapshot); use
 * {@link checkProgram} when only diagnostics matter.
 */
export function analyzeProgram(
  program: Program,
  options: AnalyzeProgramOptions = {}
): ProgramAnalysis {
  const sink = createDiagnosticSink();
  const scalars = collectScalars(program, sink);
  const resources = collectResources(program, scalars, sink);
  const requireDatasourceCoverage = options.requireDatasourceCoverage ?? true;

  for (const scalar of program.scalars) {
    if (resources.has(scalar.name)) {
      sink.push({
        code: "SCALAR_RESOURCE_NAME_CLASH",
        message: `Scalar '${scalar.name}' clashes with a resource of the same name`,
        path: `scalars.${scalar.name}`,
        span: scalar.span,
      });
    }
  }

  const fragmentNames = new Set<string>();
  for (const fragment of program.fragments) {
    const path = `fragments.${fragment.name}`;
    if (fragmentNames.has(fragment.name)) {
      sink.push({
        code: "DUPLICATE_FRAGMENT",
        message: `Duplicate fragment '${fragment.name}'`,
        path,
        span: fragment.span,
      });
      continue;
    }
    fragmentNames.add(fragment.name);
    checkFragment(fragment, path, scalars, resources, sink);
  }

  checkDatasources(program, scalars, resources, sink, { requireDatasourceCoverage });

  const queryNames = new Set<string>();
  for (const query of program.queries) {
    const path = `queries.${query.name}`;
    if (queryNames.has(query.name)) {
      sink.push({
        code: "DUPLICATE_QUERY",
        message: `Duplicate query '${query.name}'`,
        path,
        span: query.span,
      });
      continue;
    }
    queryNames.add(query.name);
    checkQuery(query, path, scalars, resources, sink);
  }

  return Object.freeze({
    program,
    diagnostics: Object.freeze([...sink.diagnostics]),
    scalars,
    resources,
    queries: buildQueryPlans(program, resources),
  });
}

/**
 * Check a Ziel program. Returns all diagnostics (does not throw).
 */
export function checkProgram(program: Program, options: AnalyzeProgramOptions = {}): Diagnostic[] {
  return [...analyzeProgram(program, options).diagnostics];
}
