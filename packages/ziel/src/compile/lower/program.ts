/**
 * Lower Langium AST → semantic Program IR.
 *
 * Defaults: `ariType = name`, object-payload shorthand sets
 * `inheritedFromIdentity`, expansions without `each` are multiplicity `"one"`,
 * `each … ( arms )` are `"many"`, scalar `metadata: null`.
 * PathRef is classified here as `param` / `payloadRef` / `itemRef`.
 * Named types resolve to `resourceRef` or `scalarRef` using declaration tables.
 * Do not collapse `scalarRef` / `resourceRef` to structural types.
 *
 * Fragments and on-level preambles desugar here: spreads expand with binding
 * rewrite, preamble fields/expansions distribute into every when-arm. Fragment
 * declarations are also kept flattened in IR so unused bodies are typechecked.
 */
import type {
  FragmentDefinition,
  Program,
  ResourceDefinition,
  ScalarDefinition,
  QueryDefinition,
} from "../../ir";
import { createDiagnosticSink, type Diagnostic, type DiagnosticSink } from "../../check/diagnostic";
import {
  isFragmentDeclaration,
  isQueryDeclaration,
  isResourceDeclaration,
  isScalarDeclaration,
  type Model,
  type FragmentDeclaration as AstFragmentDeclaration,
  type ResourceDeclaration as AstResourceDeclaration,
  type ScalarDeclaration as AstScalarDeclaration,
} from "../../lang/generated/ast";
import type { PayloadTypeLookup } from "../../check/discriminants";
import { normalizeIncludeMode } from "../../check/projection-include";
import { expandBody, lowerEnclosingWhen, type FragmentTable } from "./fragments";
import { lowerQuery } from "./query";
import { spanOf } from "./span";
import { lowerTypeExpr, lowerTypedField, type NameTables } from "./types";

/**
 * Lower a Model AST to Program IR.
 * Fragment/preamble diagnostics are pushed to `sink` (created if omitted).
 *
 * Resources are lowered before fragments/queries so spread-site `include`
 * resolution and `FRAGMENT_WHEN_MISMATCH` can consult payload types.
 */
export function lowerProgram(ast: Model, sink: DiagnosticSink = createDiagnosticSink()): Program {
  const tables = collectNameTables(ast);
  const fragmentTable = collectFragments(ast, sink);
  const scalars: ScalarDefinition[] = [];
  const resources: ResourceDefinition[] = [];

  for (const decl of ast.declarations) {
    if (isScalarDeclaration(decl)) {
      scalars.push(lowerScalar(decl));
    } else if (isResourceDeclaration(decl)) {
      resources.push(lowerResource(decl, tables));
    }
  }

  const payloadLookup: PayloadTypeLookup = new Map(
    resources.map((r) => [r.name, { payloadType: r.payloadType }])
  );

  const fragments: FragmentDefinition[] = [];
  const queries: QueryDefinition[] = [];

  for (const decl of ast.declarations) {
    if (isFragmentDeclaration(decl)) {
      // Skip duplicates already reported by collectFragments.
      if (fragmentTable.get(decl.name) !== decl) {
        continue;
      }
      fragments.push(lowerFragment(decl, fragmentTable, payloadLookup, sink));
    } else if (isQueryDeclaration(decl)) {
      queries.push(lowerQuery(decl, tables, fragmentTable, payloadLookup, sink));
    }
  }

  return {
    scalars,
    resources,
    fragments,
    queries,
    span: spanOf(ast),
  };
}

/** Codes emitted only during fragment/preamble desugar (not by checkProgram). */
export const LOWER_DIAGNOSTIC_CODES = new Set([
  "UNKNOWN_FRAGMENT",
  "FRAGMENT_RESOURCE_MISMATCH",
  "FRAGMENT_WHEN_MISMATCH",
  "FRAGMENT_CYCLE",
  "DUPLICATE_FRAGMENT",
  "DUPLICATE_SELECTED_FIELD",
]);

export function isLowerDiagnostic(diagnostic: Pick<Diagnostic, "code">): boolean {
  return LOWER_DIAGNOSTIC_CODES.has(diagnostic.code);
}

export function collectNameTables(ast: Model): NameTables {
  const resources = new Set<string>();
  const scalars = new Set<string>();
  for (const decl of ast.declarations) {
    if (isResourceDeclaration(decl)) resources.add(decl.name);
    else if (isScalarDeclaration(decl)) scalars.add(decl.name);
  }
  return { resources, scalars };
}

export function collectFragments(ast: Model, sink: DiagnosticSink): FragmentTable {
  const fragments: FragmentTable = new Map();
  for (const decl of ast.declarations) {
    if (!isFragmentDeclaration(decl)) continue;
    if (fragments.has(decl.name)) {
      sink.push({
        code: "DUPLICATE_FRAGMENT",
        message: `Duplicate fragment '${decl.name}'`,
        span: spanOf(decl),
      });
      continue;
    }
    fragments.set(decl.name, decl);
  }
  return fragments;
}

/**
 * Lower a fragment declaration: optional `when` / `include`, then expand nested
 * spreads with the fragment's own binding so the body can be typechecked
 * independently of any spread site.
 *
 * The fragment's own `include` stays on IR (applied by check/codegen); nested
 * spreads bake *their* include into the flattened selected fields.
 */
export function lowerFragment(
  decl: AstFragmentDeclaration,
  fragments: FragmentTable,
  resources: PayloadTypeLookup,
  sink: DiagnosticSink
): FragmentDefinition {
  const when = lowerEnclosingWhen(decl.when);
  const body = expandBody(
    decl,
    decl.resource,
    decl.binding,
    fragments,
    [decl.name],
    sink,
    resources,
    when
  );
  return {
    name: decl.name,
    resource: decl.resource,
    binding: decl.binding,
    when,
    include: normalizeIncludeMode(decl.include),
    selectedFields: body.selectedFields,
    expansions: body.expansions,
    span: spanOf(decl),
  };
}

export function lowerScalar(decl: AstScalarDeclaration): ScalarDefinition {
  return {
    name: decl.name,
    representation: decl.representation,
    metadata: null,
    span: spanOf(decl),
  };
}

export function lowerResource(
  decl: AstResourceDeclaration,
  tables: NameTables
): ResourceDefinition {
  const identity = { fields: decl.identity.map((f) => lowerTypedField(f, tables)) };
  return {
    name: decl.name,
    ariType: decl.name,
    identity,
    payloadType: lowerTypeExpr(decl.payloadType, tables, identity.fields),
    span: spanOf(decl),
  };
}
