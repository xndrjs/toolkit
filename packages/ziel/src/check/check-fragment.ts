/**
 * Typecheck a top-level `fragment` body in isolation.
 *
 * Fragments are often spread into narrowed `when` arms, so selected fields /
 * payload paths are validated at the spread site — not against the full
 * resource payload here. This pass focuses on scope errors that are always
 * wrong at the declaration: unknown resource, and bindings other than the
 * fragment's declared binding (plus comprehension item bindings).
 *
 * `context` / params resolve when the fragment is spread into a query, so
 * those path errors are suppressed here too.
 */
import type { FragmentDefinition } from "../ir";
import { checkExpansions } from "./check-expansions";
import { createDiagnosticSink, type DiagnosticSink } from "./diagnostic";
import type { QueryScope, ResourceTable, ScalarTable } from "./symbols";

const SUPPRESSED_IN_FRAGMENT = new Set([
  "UNKNOWN_CONTEXT_PATH",
  "UNKNOWN_PARAM",
  "UNKNOWN_SELECTED_FIELD",
  "UNKNOWN_PAYLOAD_PATH",
]);

export function checkFragment(
  fragment: FragmentDefinition,
  path: string,
  scalars: ScalarTable,
  resources: ResourceTable,
  sink: DiagnosticSink
): void {
  if (!resources.has(fragment.resource)) {
    sink.push({
      code: "UNKNOWN_RESOURCE",
      message: `Unknown resource '${fragment.resource}' in fragment '${fragment.name}'`,
      path,
      span: fragment.span,
    });
    return;
  }

  const scope: QueryScope = {
    path,
    params: new Map(),
    context: new Map(),
    bindings: new Map([[fragment.binding, fragment.resource]]),
    items: new Map(),
    payloadNarrowing: new Map(),
  };

  const bodySink = createDiagnosticSink();
  checkExpansions(fragment.expansions, path, scope, scalars, resources, bodySink);
  for (const diagnostic of bodySink.diagnostics) {
    if (SUPPRESSED_IN_FRAGMENT.has(diagnostic.code)) {
      continue;
    }
    sink.push(diagnostic);
  }
}
