import { isCompositeCstNode, type CstNode } from "langium";

import type { Expansion, Expr, ResourceConstruction, SourceSpan, TypeExpr } from "../../ir";
import {
  coveredDiscriminantLabels,
  expandPayloadObjectMembers,
  narrowPayloadByFilter,
  type PayloadTypeLookup,
} from "../../check/discriminants";
import type { DiagnosticSink } from "../../check/diagnostic";
import { resolveSelectedFields } from "../../check/projection-include";
import {
  type ExcludeClause as AstExcludeClause,
  type Expansion as AstExpansion,
  type Expression as AstExpression,
  type FragmentDeclaration as AstFragmentDeclaration,
  type FragmentSpread as AstFragmentSpread,
  type ProjectionClause as AstProjectionClause,
  type ProjectionDefaultArm as AstProjectionDefaultArm,
  type ProjectionWhenArm as AstProjectionWhenArm,
} from "../../lang/generated/ast";
import { lowerExpr } from "./expr";
import { lowerExpansion } from "./query";
import { spanOf } from "./span";

export type FragmentTable = Map<string, AstFragmentDeclaration>;

export type FlattenedBody = {
  selectedFields: string[];
  expansions: Expansion[];
  excludedFields: string[];
};

type BodyItem =
  | { kind: "field"; name: string; span: SourceSpan | null }
  | { kind: "expansion"; expansion: AstExpansion }
  | { kind: "spread"; spread: AstFragmentSpread }
  | { kind: "exclude"; names: string[]; span: SourceSpan | null };

/** AST nodes that own a mixed field / expand / spread / exclude body. */
type BodyContainer =
  | AstProjectionClause
  | AstProjectionWhenArm
  | AstProjectionDefaultArm
  | AstFragmentDeclaration;

const EMPTY_BODY: FlattenedBody = { selectedFields: [], expansions: [], excludedFields: [] };

function cstSpan(cst: CstNode, uri: string | null): SourceSpan {
  return { start: cst.offset, end: cst.end, uri };
}

function containerUri(container: BodyContainer): string | null {
  try {
    return spanOf(container)?.uri ?? null;
  } catch {
    return null;
  }
}

export function expandBody(
  container: BodyContainer,
  resource: string,
  binding: string,
  fragments: FragmentTable,
  stack: string[],
  sink: DiagnosticSink,
  resources: PayloadTypeLookup,
  enclosingWhen: Expr | null = null
): FlattenedBody {
  const selectedFields: string[] = [];
  const expansions: Expansion[] = [];
  const excludedFields: string[] = [];
  const seenFields = new Set<string>();
  const seenExcluded = new Set<string>();
  const fallbackSpan = spanOf(container);

  for (const item of bodyItemsInOrder(container)) {
    if (item.kind === "field") {
      if (seenFields.has(item.name)) {
        sink.push({
          code: "DUPLICATE_SELECTED_FIELD",
          message: `Duplicate selected field '${item.name}'`,
          span: item.span ?? fallbackSpan,
        });
      }
      seenFields.add(item.name);
      selectedFields.push(item.name);
    } else if (item.kind === "expansion") {
      expansions.push(lowerExpansion(item.expansion));
    } else if (item.kind === "exclude") {
      for (const name of item.names) {
        if (seenExcluded.has(name)) {
          sink.push({
            code: "DUPLICATE_EXCLUDED_FIELD",
            message: `Duplicate excluded field '${name}'`,
            span: item.span ?? fallbackSpan,
          });
        }
        seenExcluded.add(name);
        excludedFields.push(name);
      }
    } else {
      const spreadBody = expandSpread(
        item.spread,
        resource,
        binding,
        fragments,
        stack,
        sink,
        resources,
        enclosingWhen
      );
      for (const field of spreadBody.selectedFields) {
        if (seenFields.has(field)) {
          sink.push({
            code: "DUPLICATE_SELECTED_FIELD",
            message: `Duplicate selected field '${field}'`,
            span: spanOf(item.spread) ?? fallbackSpan,
          });
        }
        seenFields.add(field);
        selectedFields.push(field);
      }
      expansions.push(...spreadBody.expansions);
      // Fragment excludes are already applied in expandSpread selectedFields.
    }
  }

  return { selectedFields, expansions, excludedFields };
}

export function expandSpread(
  spread: AstFragmentSpread,
  resource: string,
  binding: string,
  fragments: FragmentTable,
  stack: string[],
  sink: DiagnosticSink,
  resources: PayloadTypeLookup,
  enclosingWhen: Expr | null = null
): FlattenedBody {
  const name = spread.name;
  if (stack.includes(name)) {
    sink.push({
      code: "FRAGMENT_CYCLE",
      message: `Fragment cycle detected involving '${name}'`,
      span: spanOf(spread),
    });
    return EMPTY_BODY;
  }

  const frag = fragments.get(name);
  if (!frag) {
    sink.push({
      code: "UNKNOWN_FRAGMENT",
      message: `Unknown fragment '${name}'`,
      span: spanOf(spread),
    });
    return EMPTY_BODY;
  }

  if (frag.resource !== resource) {
    sink.push({
      code: "FRAGMENT_RESOURCE_MISMATCH",
      message: `Fragment '${name}' is declared on '${frag.resource}' but spread on '${resource}'`,
      span: spanOf(spread),
    });
    return EMPTY_BODY;
  }

  const payloadType = resources.get(resource)?.payloadType;
  const fragWhen = frag.when ? lowerExpr(frag.when) : null;

  if (fragWhen && enclosingWhen && payloadType) {
    if (
      fragmentWhenMismatchesEnclosing(
        payloadType,
        fragWhen,
        frag.binding,
        enclosingWhen,
        binding,
        resources
      )
    ) {
      sink.push({
        code: "FRAGMENT_WHEN_MISMATCH",
        message: `Fragment '${name}' when-clause is incompatible with enclosing arm narrowing`,
        span: spanOf(spread),
      });
      return EMPTY_BODY;
    }
  }

  // Nested spreads inside the fragment inherit the fragment's own `when` as
  // enclosing narrowing (not the outer arm's), matching fragment-body checking.
  const nestedEnclosing = fragWhen ?? enclosingWhen;
  const body = expandBody(
    frag,
    resource,
    binding,
    fragments,
    [...stack, name],
    sink,
    resources,
    nestedEnclosing
  );

  // Fragments have no `include` — only explicit fields minus excludes / expand aliases.
  const bodyPayload = payloadForFragmentExclude(payloadType, fragWhen, frag.binding, resources);
  const selectedFields = bodyPayload
    ? resolveSelectedFields(
        body.selectedFields,
        body.expansions,
        null,
        bodyPayload,
        resources,
        body.excludedFields
      )
    : body.selectedFields.filter((f) => !body.excludedFields.includes(f));

  return {
    selectedFields,
    expansions: body.expansions.map((e) => rebindExpansion(e, frag.binding, binding)),
    excludedFields: [],
  };
}

/** Payload used when applying fragment `exclude` at a spread site. */
function payloadForFragmentExclude(
  payloadType: TypeExpr | undefined,
  fragWhen: Expr | null,
  fragBinding: string,
  resources: PayloadTypeLookup
): TypeExpr | undefined {
  if (!payloadType) return undefined;
  if (!fragWhen) return payloadType;
  return narrowPayloadByFilter(payloadType, fragWhen, fragBinding, resources) ?? payloadType;
}

/**
 * True when fragment `when` and enclosing arm `when` cover disjoint discriminant
 * labels (or narrowed payload members have no overlap).
 */
export function fragmentWhenMismatchesEnclosing(
  payloadType: TypeExpr,
  fragWhen: Expr,
  fragBinding: string,
  enclosingWhen: Expr,
  enclosingBinding: string,
  resources: PayloadTypeLookup
): boolean {
  const fragLabels = coveredDiscriminantLabels(fragWhen, fragBinding, "payload");
  const armLabels = coveredDiscriminantLabels(enclosingWhen, enclosingBinding, "payload");
  if (fragLabels.length > 0 && armLabels.length > 0) {
    return !fragLabels.some((label) => armLabels.includes(label));
  }

  const fragNarrow = narrowPayloadByFilter(payloadType, fragWhen, fragBinding, resources);
  const armNarrow = narrowPayloadByFilter(payloadType, enclosingWhen, enclosingBinding, resources);
  if (!fragNarrow || !armNarrow) return false;

  const fragMembers = expandPayloadObjectMembers(fragNarrow, resources);
  const armMembers = expandPayloadObjectMembers(armNarrow, resources);
  if (!fragMembers?.length || !armMembers?.length) return false;

  // Disjoint when no narrowed member appears in both sets (reference or structural).
  return !fragMembers.some((fm) => armMembers.some((am) => sameNarrowedMember(fm, am)));
}

type ObjectMember = Extract<TypeExpr, { kind: "object" }>;

function stringLiteralFields(member: ObjectMember): Map<string, string> {
  const out = new Map<string, string>();
  for (const field of member.fields) {
    if (field.type.kind === "stringLiteral") {
      out.set(field.name, field.type.value);
    }
  }
  return out;
}

function sameNarrowedMember(a: ObjectMember, b: ObjectMember): boolean {
  if (a === b) return true;

  const la = stringLiteralFields(a);
  const lb = stringLiteralFields(b);
  const shared = [...la.keys()].filter((name) => lb.has(name));
  if (shared.length > 0) {
    return shared.every((name) => la.get(name) === lb.get(name));
  }

  if (a.fields.length !== b.fields.length) return false;
  for (let i = 0; i < a.fields.length; i++) {
    if (a.fields[i]!.name !== b.fields[i]!.name) return false;
  }
  return true;
}

/** Lower an optional AST when-expression for use as enclosing narrowing. */
export function lowerEnclosingWhen(when: AstExpression | undefined): Expr | null {
  return when ? lowerExpr(when) : null;
}

/**
 * Recover source order of fields / expands / spreads / excludes from CST.
 * Langium stores the alternatives in separate arrays.
 */
export function bodyItemsInOrder(container: BodyContainer): BodyItem[] {
  const uri = containerUri(container);
  const spreadByOffset = new Map<number, AstFragmentSpread>();
  for (const spread of container.spreads) {
    const offset = spread.$cstNode?.offset;
    if (offset !== undefined) spreadByOffset.set(offset, spread);
  }
  const expansionByOffset = new Map<number, AstExpansion>();
  for (const expansion of container.expansions) {
    const offset = expansion.$cstNode?.offset;
    if (offset !== undefined) expansionByOffset.set(offset, expansion);
  }
  const excludeByOffset = new Map<number, AstExcludeClause>();
  for (const exclude of container.excludes) {
    const offset = exclude.$cstNode?.offset;
    if (offset !== undefined) excludeByOffset.set(offset, exclude);
  }

  const fieldQueue = [...container.selectedFields];
  const ordered: { offset: number; item: BodyItem }[] = [];
  const seenOffsets = new Set<number>();

  const cst = container.$cstNode;
  const content = cst && isCompositeCstNode(cst) ? cst.content : [];

  for (const child of content) {
    // Skip nested when/default-arm subtrees when walking a projection clause.
    // Leaves inside an arm still have that arm as `astNode` — those must not
    // be skipped.
    const childType = child.astNode?.$type;
    if (
      (childType === "ProjectionWhenArm" || childType === "ProjectionDefaultArm") &&
      child.astNode !== container
    ) {
      continue;
    }

    if (spreadByOffset.has(child.offset)) {
      if (!seenOffsets.has(child.offset)) {
        seenOffsets.add(child.offset);
        ordered.push({
          offset: child.offset,
          item: { kind: "spread", spread: spreadByOffset.get(child.offset)! },
        });
      }
      continue;
    }
    if (expansionByOffset.has(child.offset)) {
      if (!seenOffsets.has(child.offset)) {
        seenOffsets.add(child.offset);
        ordered.push({
          offset: child.offset,
          item: { kind: "expansion", expansion: expansionByOffset.get(child.offset)! },
        });
      }
      continue;
    }
    if (excludeByOffset.has(child.offset)) {
      if (!seenOffsets.has(child.offset)) {
        seenOffsets.add(child.offset);
        const clause = excludeByOffset.get(child.offset)!;
        ordered.push({
          offset: child.offset,
          item: {
            kind: "exclude",
            names: [...clause.names],
            span: cstSpan(child, uri),
          },
        });
      }
      continue;
    }

    const text = typeof child.text === "string" ? child.text : undefined;
    if (text !== undefined && fieldQueue[0] === text) {
      ordered.push({
        offset: child.offset,
        item: { kind: "field", name: fieldQueue.shift()!, span: cstSpan(child, uri) },
      });
    }
  }

  // Fallback if CST matching failed (e.g. missing CST in tests).
  for (const name of fieldQueue) {
    ordered.push({
      offset: Number.MAX_SAFE_INTEGER,
      item: { kind: "field", name, span: null },
    });
  }
  for (const [offset, spread] of spreadByOffset) {
    if (!seenOffsets.has(offset)) {
      ordered.push({ offset, item: { kind: "spread", spread } });
    }
  }
  for (const [offset, expansion] of expansionByOffset) {
    if (!seenOffsets.has(offset)) {
      ordered.push({ offset, item: { kind: "expansion", expansion } });
    }
  }
  for (const [offset, clause] of excludeByOffset) {
    if (!seenOffsets.has(offset)) {
      ordered.push({
        offset,
        item: { kind: "exclude", names: [...clause.names], span: spanOf(clause) },
      });
    }
  }

  ordered.sort((a, b) => a.offset - b.offset);
  return ordered.map((e) => e.item);
}

/**
 * Report selected fields that appear in both preamble and arm body
 * (within-body duplicates are already diagnosed in {@link expandBody}).
 */
export function rejectPreambleArmFieldClash(
  preamble: FlattenedBody,
  armBody: FlattenedBody,
  span: SourceSpan | null,
  sink: DiagnosticSink
): void {
  const preambleFields = new Set(preamble.selectedFields);
  const reported = new Set<string>();
  for (const field of armBody.selectedFields) {
    if (preambleFields.has(field) && !reported.has(field)) {
      reported.add(field);
      sink.push({
        code: "DUPLICATE_SELECTED_FIELD",
        message: `Duplicate selected field '${field}'`,
        span,
      });
    }
  }

  const preambleExcluded = new Set(preamble.excludedFields);
  const reportedExcluded = new Set<string>();
  for (const field of armBody.excludedFields) {
    if (preambleExcluded.has(field) && !reportedExcluded.has(field)) {
      reportedExcluded.add(field);
      sink.push({
        code: "DUPLICATE_EXCLUDED_FIELD",
        message: `Duplicate excluded field '${field}'`,
        span,
      });
    }
  }
}

/** @deprecated Prefer {@link expandBody} + {@link rejectPreambleArmFieldClash}. */
export function rejectDuplicateBody(
  body: FlattenedBody,
  span: SourceSpan | null,
  sink: DiagnosticSink
): void {
  const seenFields = new Set<string>();
  for (const field of body.selectedFields) {
    if (seenFields.has(field)) {
      sink.push({
        code: "DUPLICATE_SELECTED_FIELD",
        message: `Duplicate selected field '${field}'`,
        span,
      });
    }
    seenFields.add(field);
  }
  // Expansion alias duplicates surface via checkProgram (DUPLICATE_EXPANSION_ALIAS)
  // on the flattened IR.
}

export function rebindExpansion(expansion: Expansion, from: string, to: string): Expansion {
  if (from === to) return expansion;
  return {
    ...expansion,
    target: expansion.target ? rebindConstruction(expansion.target, from, to) : null,
    comprehension: expansion.comprehension
      ? {
          itemBinding: expansion.comprehension.itemBinding,
          source: rebindExpr(expansion.comprehension.source, from, to),
          arms: expansion.comprehension.arms.map((arm) => ({
            target: rebindConstruction(arm.target, from, to),
            when: arm.when ? rebindExpr(arm.when, from, to) : null,
            onFailure: arm.onFailure,
          })),
        }
      : null,
  };
}

export function rebindConstruction(
  construction: ResourceConstruction,
  from: string,
  to: string
): ResourceConstruction {
  return {
    ...construction,
    args: construction.args.map((arg) => ({
      ...arg,
      value: rebindExpr(arg.value, from, to),
    })),
  };
}

export function rebindExpr(expr: Expr, from: string, to: string): Expr {
  if (from === to) return expr;
  switch (expr.kind) {
    case "literal":
    case "param":
    case "context":
      return expr;
    case "payloadRef":
    case "identityRef":
      return expr.binding === from ? { ...expr, binding: to } : expr;
    case "itemRef":
      // Item bindings are comprehension-local; do not rewrite.
      return expr;
    case "arrayLiteral":
      return {
        ...expr,
        elements: expr.elements.map((el) => rebindExpr(el, from, to)),
      };
    case "unary":
      return {
        ...expr,
        operand: rebindExpr(expr.operand, from, to),
      };
    case "cast":
      return {
        ...expr,
        operand: rebindExpr(expr.operand, from, to),
      };
    case "binary":
      return {
        ...expr,
        left: rebindExpr(expr.left, from, to),
        right: rebindExpr(expr.right, from, to),
      };
  }
}
