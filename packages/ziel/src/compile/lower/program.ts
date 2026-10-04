/**
 * Lower Langium AST → semantic Program IR.
 *
 * Defaults: `ariType = name`, object-payload shorthand sets
 * `inheritedFromIdentity`, expansions without `each` are multiplicity `"one"`,
 * `each … ( arms )` are `"many"`, scalar `metadata: null`.
 * PathRef is classified here as `param` / `payloadRef` / `itemRef`.
 * Named types resolve to `resourceRef` / `scalarRef` / `opaqueRef` (or
 * `unresolvedNamedRef`) using declaration tables.
 * Do not collapse `scalarRef` / `resourceRef` / `opaqueRef` to structural types.
 *
 * Fragments and on-level preambles desugar here: spreads expand with binding
 * rewrite, preamble fields/expansions distribute into every when-arm. Fragment
 * declarations are also kept flattened in IR so unused bodies are typechecked.
 * Datasources lower after name tables exist (routing metadata only).
 */
import type {
  DatasourceDefinition,
  FragmentDefinition,
  OpaqueDefinition,
  Program,
  ResourceDefinition,
  ScalarDefinition,
  QueryDefinition,
} from "../../ir";
import type { PayloadTypeLookup } from "../../check/discriminants";
import { createDiagnosticSink, type Diagnostic, type DiagnosticSink } from "../../check/diagnostic";
import {
  isDatasourceDeclaration,
  isFragmentDeclaration,
  isOpaqueDeclaration,
  isQueryDeclaration,
  isResourceDeclaration,
  isScalarDeclaration,
  type Model,
  type FragmentDeclaration as AstFragmentDeclaration,
  type OpaqueDeclaration as AstOpaqueDeclaration,
  type ResourceDeclaration as AstResourceDeclaration,
  type ScalarDeclaration as AstScalarDeclaration,
} from "../../lang/generated/ast";
import { lowerDatasource } from "./datasources";
import { expandBody, lowerEnclosingWhen, type FragmentTable } from "./fragments";
import { lowerQuery } from "./query";
import { spanOf } from "./span";
import { lowerTypeExpr, lowerTypedField, type NameTables } from "./types";

/**
 * Lower a Model AST to Program IR.
 * Fragment/preamble diagnostics are pushed to `sink` (created if omitted).
 *
 * Resources are lowered before fragments/queries so spread-site payload
 * narrowing and `FRAGMENT_WHEN_MISMATCH` can consult payload types.
 */
export function lowerProgram(ast: Model, sink: DiagnosticSink = createDiagnosticSink()): Program {
  return lowerModels([ast], spanOf(ast), sink);
}

/** Lower multiple parsed documents against one global declaration workspace. */
export function lowerWorkspace(
  models: readonly Model[],
  sink: DiagnosticSink = createDiagnosticSink()
): Program {
  return lowerModels(models, null, sink);
}

function lowerModels(
  models: readonly Model[],
  programSpan: Program["span"],
  sink: DiagnosticSink
): Program {
  const tables = collectWorkspaceNameTables(models);
  const fragmentTable = collectWorkspaceFragments(models, sink);
  const scalars: ScalarDefinition[] = [];
  const opaques: OpaqueDefinition[] = [];
  const resources: ResourceDefinition[] = [];

  // Opaques before resources/queries so named payload types can resolve to opaqueRef.
  for (const ast of models) {
    for (const decl of ast.declarations) {
      if (isScalarDeclaration(decl)) {
        scalars.push(lowerScalar(decl));
      } else if (isOpaqueDeclaration(decl)) {
        opaques.push(lowerOpaque(decl));
      }
    }
  }

  for (const ast of models) {
    for (const decl of ast.declarations) {
      if (isResourceDeclaration(decl)) {
        resources.push(lowerResource(decl, tables));
      }
    }
  }

  // Match checker symbol ownership: the first declaration is canonical.
  const payloadLookup = new Map<string, { payloadType: ResourceDefinition["payloadType"] }>();
  for (const resource of resources) {
    if (!payloadLookup.has(resource.name)) {
      payloadLookup.set(resource.name, { payloadType: resource.payloadType });
    }
  }

  const fragments: FragmentDefinition[] = [];
  const datasources: DatasourceDefinition[] = [];
  const queries: QueryDefinition[] = [];

  for (const ast of models) {
    for (const decl of ast.declarations) {
      if (isFragmentDeclaration(decl)) {
        // Skip duplicates already reported by collectWorkspaceFragments.
        if (fragmentTable.get(decl.name) !== decl) {
          continue;
        }
        fragments.push(lowerFragment(decl, fragmentTable, payloadLookup, sink));
      } else if (isDatasourceDeclaration(decl)) {
        datasources.push(lowerDatasource(decl, tables));
      } else if (isQueryDeclaration(decl)) {
        queries.push(lowerQuery(decl, tables, fragmentTable, payloadLookup, sink));
      }
    }
  }

  return {
    scalars,
    opaques,
    resources,
    fragments,
    datasources,
    queries,
    span: programSpan,
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
  return collectWorkspaceNameTables([ast]);
}

export function collectWorkspaceNameTables(models: readonly Model[]): NameTables {
  const resources = new Set<string>();
  const scalars = new Set<string>();
  const opaques = new Set<string>();
  for (const ast of models) {
    for (const decl of ast.declarations) {
      if (isResourceDeclaration(decl)) resources.add(decl.name);
      else if (isScalarDeclaration(decl)) scalars.add(decl.name);
      else if (isOpaqueDeclaration(decl)) opaques.add(decl.name);
    }
  }
  return { resources, scalars, opaques };
}

export function collectFragments(ast: Model, sink: DiagnosticSink): FragmentTable {
  return collectWorkspaceFragments([ast], sink);
}

export function collectWorkspaceFragments(
  models: readonly Model[],
  sink: DiagnosticSink
): FragmentTable {
  const fragments: FragmentTable = new Map();
  for (const ast of models) {
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
  }
  return fragments;
}

/**
 * Lower a fragment declaration: optional `when`, then expand nested spreads
 * with the fragment's own binding so the body can be typechecked independently
 * of any spread site. Fragments do not carry `include` (projection sites do).
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
    selectedFields: body.selectedFields,
    excludedFields: body.excludedFields,
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

export function lowerOpaque(decl: AstOpaqueDeclaration): OpaqueDefinition {
  return {
    name: decl.name,
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
