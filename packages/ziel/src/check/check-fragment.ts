/**
 * Typecheck a top-level `fragment` body in isolation.
 *
 * Fragments carry explicit fields / expands / excludes only (no `include`).
 * Optional `when` must be boolean and narrows `payloadNarrowing` for expansions
 * and field checks against the (narrowed) raw resource payload.
 *
 * `context` / params resolve when the fragment is spread into a query, so
 * those path errors are suppressed here.
 */
import type { FragmentDefinition } from "../ir";
import { formatType } from "./assignability";
import { checkExpansions, checkSelectedFields } from "./check-expansions";
import { narrowPayloadByFilter } from "./discriminants";
import { createDiagnosticSink, type DiagnosticSink } from "./diagnostic";
import { inferPayloadWhenExprType, isBooleanWhenType } from "./expressions";
import { checkExcludedFields, resolveSelectedFields } from "./projection-include";
import { type QueryScope, type ResourceTable, type ScalarTable } from "./symbols";

const SUPPRESSED_IN_FRAGMENT = new Set(["UNKNOWN_CONTEXT_PATH", "UNKNOWN_PARAM"]);

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

  const resource = resources.get(fragment.resource)!;
  const payloadType = resource.payloadType;

  const scope: QueryScope = {
    path,
    params: new Map(),
    context: new Map(),
    bindings: new Map([[fragment.binding, fragment.resource]]),
    items: new Map(),
    payloadNarrowing: new Map(),
  };

  let bodyPayload = payloadType;
  if (fragment.when) {
    const whenType = inferPayloadWhenExprType(
      fragment.when,
      `${path}.when`,
      fragment.binding,
      payloadType,
      scope,
      resources,
      sink
    );
    if (whenType && !isBooleanWhenType(whenType)) {
      sink.push({
        code: "TYPE_MISMATCH",
        message: `Fragment when-clause must be boolean, got ${formatType(whenType)}`,
        path: `${path}.when`,
        span: fragment.when.span,
      });
    }
    bodyPayload =
      narrowPayloadByFilter(payloadType, fragment.when, fragment.binding, resources) ?? payloadType;
    scope.payloadNarrowing.set(fragment.binding, bodyPayload);
  }

  checkExcludedFields(
    fragment.excludedFields,
    fragment.selectedFields,
    fragment.expansions,
    bodyPayload,
    resources,
    path,
    fragment.span,
    sink
  );
  const effectiveFields = resolveSelectedFields(
    fragment.selectedFields,
    fragment.expansions,
    null,
    bodyPayload,
    resources,
    fragment.excludedFields
  );
  checkSelectedFields(
    effectiveFields,
    bodyPayload,
    fragment.resource,
    path,
    fragment.span,
    resources,
    sink
  );

  const bodySink = createDiagnosticSink();
  checkExpansions(fragment.expansions, path, scope, scalars, resources, bodySink);
  for (const diagnostic of bodySink.diagnostics) {
    if (SUPPRESSED_IN_FRAGMENT.has(diagnostic.code)) {
      continue;
    }
    sink.push(diagnostic);
  }
}
