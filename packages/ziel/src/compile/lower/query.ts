import type {
  Expansion,
  IslandClause,
  OnFailurePolicy,
  ProjectionArm,
  ProjectionArmBody,
  QueryDefinition,
  QueryRoot,
  ResolveArm,
  ResourceProjection,
} from "../../ir";
import type { PayloadTypeLookup } from "../../check/discriminants";
import type { DiagnosticSink } from "../../check/diagnostic";
import {
  type Expansion as AstExpansion,
  isOnFailureSetError,
  isOnFailureSetNull,
  type IslandClause as AstIslandClause,
  type OnFailureClause as AstOnFailureClause,
  type ProjectionClause as AstProjectionClause,
  type ProjectionDefaultArm as AstProjectionDefaultArm,
  type ProjectionWhenArm as AstProjectionWhenArm,
  type QueryDeclaration as AstQueryDeclaration,
  type ResolveArm as AstResolveArm,
} from "../../lang/generated/ast";
import { lowerConstruction, lowerExpr } from "./expr";
import {
  expandBody,
  lowerEnclosingWhen,
  rejectPreambleArmFieldClash,
  type FlattenedBody,
  type FragmentTable,
} from "./fragments";
import { spanOf } from "./span";
import { normalizeIncludeMode } from "../../check/projection-include";
import { lowerTypedField, type NameTables } from "./types";

function lowerOnFailure(clause: AstOnFailureClause | undefined): OnFailurePolicy {
  if (!clause) return "throw";
  if (isOnFailureSetNull(clause)) return "setNull";
  if (isOnFailureSetError(clause)) return "setError";
  return "throw";
}

export function lowerQuery(
  decl: AstQueryDeclaration,
  tables: NameTables,
  fragments: FragmentTable,
  resources: PayloadTypeLookup,
  sink: DiagnosticSink
): QueryDefinition {
  return {
    name: decl.name,
    parameters: decl.parameters.map((f) => lowerTypedField(f, tables)),
    context: decl.context ? decl.context.fields.map((f) => lowerTypedField(f, tables)) : [],
    contextDeclared: decl.context !== undefined,
    roots: lowerQueryRoots(decl),
    projections: decl.projections.map((p) => lowerProjection(p, fragments, resources, sink)),
    islands: decl.islands?.clauses.map(lowerIslandClause) ?? [],
    span: spanOf(decl),
  };
}

export function lowerIslandClause(clause: AstIslandClause): IslandClause {
  return {
    resource: clause.resource,
    binding: clause.binding ?? null,
    when: clause.when ? lowerExpr(clause.when) : null,
    span: spanOf(clause),
  };
}

/**
 * Singular `root R(…)` → one entry with `alias: null`.
 * `roots { a: R(…); … }` → one entry per alias (aliases stay non-null).
 */
export function lowerQueryRoots(decl: AstQueryDeclaration): QueryRoot[] {
  if (decl.root) {
    return [
      {
        alias: null,
        construction: lowerConstruction(decl.root.construction),
        span: spanOf(decl.root),
      },
    ];
  }
  if (decl.roots) {
    return decl.roots.entries.map((entry) => ({
      alias: entry.alias,
      construction: lowerConstruction(entry.construction),
      span: spanOf(entry),
    }));
  }
  // Grammar XOR usually prevents this; leave empty for the checker.
  return [];
}

export function lowerProjection(
  clause: AstProjectionClause,
  fragments: FragmentTable,
  resources: PayloadTypeLookup,
  sink: DiagnosticSink
): ResourceProjection {
  const include = normalizeIncludeMode(clause.include);

  if (clause.resolveArms.length > 0) {
    return {
      resource: clause.resource,
      binding: clause.binding,
      selectedFields: [],
      expansions: [],
      excludedFields: [],
      include: null,
      arms: null,
      defaultArm: null,
      resolveArms: clause.resolveArms.map(lowerResolveArm),
      span: spanOf(clause),
    };
  }

  const preamble = expandBody(
    clause,
    clause.resource,
    clause.binding,
    fragments,
    [],
    sink,
    resources,
    null
  );

  if (clause.whenArms.length > 0) {
    const arms = clause.whenArms.map((arm) =>
      lowerProjectionArm(arm, clause.resource, clause.binding, preamble, fragments, resources, sink)
    );
    const defaultArm = clause.defaultArm
      ? lowerProjectionDefaultArm(
          clause.defaultArm,
          clause.resource,
          clause.binding,
          preamble,
          fragments,
          resources,
          sink
        )
      : null;
    return {
      resource: clause.resource,
      binding: clause.binding,
      selectedFields: [],
      expansions: [],
      excludedFields: [],
      include,
      arms,
      defaultArm,
      resolveArms: null,
      span: spanOf(clause),
    };
  }

  // Within-body duplicate fields are reported in expandBody.
  // Lone `default` without when-arms is rejected by check.
  return {
    resource: clause.resource,
    binding: clause.binding,
    selectedFields: preamble.selectedFields,
    expansions: preamble.expansions,
    excludedFields: preamble.excludedFields,
    include,
    arms: null,
    defaultArm: clause.defaultArm
      ? lowerProjectionDefaultArm(
          clause.defaultArm,
          clause.resource,
          clause.binding,
          preamble,
          fragments,
          resources,
          sink
        )
      : null,
    resolveArms: null,
    span: spanOf(clause),
  };
}

export function lowerResolveArm(arm: AstResolveArm): ResolveArm {
  return {
    target: lowerConstruction(arm.target),
    when: arm.when ? lowerExpr(arm.when) : null,
    span: spanOf(arm),
  };
}

export function lowerProjectionArm(
  arm: AstProjectionWhenArm,
  resource: string,
  binding: string,
  preamble: FlattenedBody,
  fragments: FragmentTable,
  resources: PayloadTypeLookup,
  sink: DiagnosticSink
): ProjectionArm {
  const when = lowerEnclosingWhen(arm.when)!;
  const armBody = expandBody(arm, resource, binding, fragments, [], sink, resources, when);
  rejectPreambleArmFieldClash(preamble, armBody, spanOf(arm), sink);
  const combined: FlattenedBody = {
    selectedFields: [...preamble.selectedFields, ...armBody.selectedFields],
    expansions: [...preamble.expansions, ...armBody.expansions],
    excludedFields: [...preamble.excludedFields, ...armBody.excludedFields],
  };
  return {
    when,
    selectedFields: combined.selectedFields,
    expansions: combined.expansions,
    excludedFields: combined.excludedFields,
    include: normalizeIncludeMode(arm.include),
    span: spanOf(arm),
  };
}

export function lowerProjectionDefaultArm(
  arm: AstProjectionDefaultArm,
  resource: string,
  binding: string,
  preamble: FlattenedBody,
  fragments: FragmentTable,
  resources: PayloadTypeLookup,
  sink: DiagnosticSink
): ProjectionArmBody {
  const armBody = expandBody(arm, resource, binding, fragments, [], sink, resources, null);
  rejectPreambleArmFieldClash(preamble, armBody, spanOf(arm), sink);
  return {
    selectedFields: [...preamble.selectedFields, ...armBody.selectedFields],
    expansions: [...preamble.expansions, ...armBody.expansions],
    excludedFields: [...preamble.excludedFields, ...armBody.excludedFields],
    include: normalizeIncludeMode(arm.include),
    span: spanOf(arm),
  };
}

export function lowerExpansion(expansion: AstExpansion): Expansion {
  const each = expansion.each;
  if (each) {
    const itemBindings = new Set([each.itemBinding]);
    return {
      alias: expansion.alias,
      target: null,
      multiplicity: "many",
      comprehension: {
        itemBinding: each.itemBinding,
        source: lowerExpr(each.source, /* itemBindings */ new Set()),
        arms: each.arms.map((arm) => ({
          target: lowerConstruction(arm.target, itemBindings),
          when: arm.when ? lowerExpr(arm.when, itemBindings) : null,
          onFailure: lowerOnFailure(arm.onFailure),
        })),
      },
      /** Many-expand policy lives on arms; keep throw as a inert default. */
      onFailure: "throw",
      span: spanOf(expansion),
    };
  }
  if (!expansion.target) {
    throw new Error("lowerExpansion: one-expand missing target construction");
  }
  return {
    alias: expansion.alias,
    target: lowerConstruction(expansion.target),
    multiplicity: "one",
    comprehension: null,
    onFailure: lowerOnFailure(expansion.onFailure),
    span: spanOf(expansion),
  };
}
