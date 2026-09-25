import type { Program } from "../ir";
import { checkQuery } from "./check-query";
import { collectResources, collectScalars } from "./collect";
import { createDiagnosticSink, type Diagnostic } from "./diagnostic";

/**
 * Check a NaviQL program. Returns all diagnostics (does not throw).
 */
export function checkProgram(program: Program): Diagnostic[] {
  const sink = createDiagnosticSink();
  const scalars = collectScalars(program, sink);
  const resources = collectResources(program, scalars, sink);

  for (const scalar of program.scalars) {
    if (resources.has(scalar.name)) {
      sink.push({
        code: "SCALAR_RESOURCE_NAME_CLASH",
        message: `Scalar '${scalar.name}' clashes with a resource of the same name`,
        path: `scalars.${scalar.name}`,
      });
    }
  }

  const queryNames = new Set<string>();
  for (const query of program.queries) {
    const path = `queries.${query.name}`;
    if (queryNames.has(query.name)) {
      sink.push({
        code: "DUPLICATE_QUERY",
        message: `Duplicate query '${query.name}'`,
        path,
      });
      continue;
    }
    queryNames.add(query.name);
    checkQuery(query, path, scalars, resources, sink);
  }

  return sink.diagnostics;
}
