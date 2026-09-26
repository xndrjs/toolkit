import type {
  Expansion,
  ProjectionArm,
  QueryDefinition,
  QueryRoot,
  ResolveArm,
  ResourceProjection,
} from "../../ir";
import type { DiagnosticSink } from "../../check/diagnostic";
import {
  type Expansion as AstExpansion,
  type ProjectionClause as AstProjectionClause,
  type ProjectionWhenArm as AstProjectionWhenArm,
  type QueryDeclaration as AstQueryDeclaration,
  type ResolveArm as AstResolveArm,
} from "../../lang/generated/ast";
import { lowerConstruction, lowerExpr } from "./expr";
import {
  expandBody,
  rejectPreambleArmFieldClash,
  type FlattenedBody,
  type FragmentTable,
} from "./fragments";
import { spanOf } from "./span";
import { lowerTypedField, type NameTables } from "./types";

export function lowerQuery(
  decl: AstQueryDeclaration,
  tables: NameTables,
  fragments: FragmentTable,
  sink: DiagnosticSink
): QueryDefinition {
  return {
    name: decl.name,
    parameters: decl.parameters.map((f) => lowerTypedField(f, tables)),
    context: decl.context ? decl.context.fields.map((f) => lowerTypedField(f, tables)) : [],
    roots: lowerQueryRoots(decl),
    projections: decl.projections.map((p) => lowerProjection(p, fragments, sink)),
    islands: [],
    span: spanOf(decl),
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
  sink: DiagnosticSink
): ResourceProjection {
  if (clause.resolveArms.length > 0) {
    return {
      resource: clause.resource,
      binding: clause.binding,
      selectedFields: [],
      expansions: [],
      arms: null,
      resolveArms: clause.resolveArms.map(lowerResolveArm),
      span: spanOf(clause),
    };
  }

  const preamble = expandBody(clause, clause.resource, clause.binding, fragments, [], sink);

  if (clause.whenArms.length > 0) {
    const arms = clause.whenArms.map((arm) =>
      lowerProjectionArm(arm, clause.resource, clause.binding, preamble, fragments, sink)
    );
    return {
      resource: clause.resource,
      binding: clause.binding,
      selectedFields: [],
      expansions: [],
      arms,
      resolveArms: null,
      span: spanOf(clause),
    };
  }

  // Within-body duplicate fields are reported in expandBody.
  return {
    resource: clause.resource,
    binding: clause.binding,
    selectedFields: preamble.selectedFields,
    expansions: preamble.expansions,
    arms: null,
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
  sink: DiagnosticSink
): ProjectionArm {
  const armBody = expandBody(arm, resource, binding, fragments, [], sink);
  rejectPreambleArmFieldClash(preamble, armBody, spanOf(arm), sink);
  const combined: FlattenedBody = {
    selectedFields: [...preamble.selectedFields, ...armBody.selectedFields],
    expansions: [...preamble.expansions, ...armBody.expansions],
  };
  return {
    when: lowerExpr(arm.when),
    selectedFields: combined.selectedFields,
    expansions: combined.expansions,
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
        })),
      },
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
    span: spanOf(expansion),
  };
}
