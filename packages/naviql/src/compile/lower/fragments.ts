import { isCompositeCstNode, type CstNode } from "langium";

import type { Expansion, Expr, ResourceConstruction, SourceSpan } from "../../ir";
import type { DiagnosticSink } from "../../check/diagnostic";
import {
  type Expansion as AstExpansion,
  type FragmentDeclaration as AstFragmentDeclaration,
  type FragmentSpread as AstFragmentSpread,
  type ProjectionClause as AstProjectionClause,
  type ProjectionWhenArm as AstProjectionWhenArm,
} from "../../lang/generated/ast";
import { lowerExpansion } from "./query";
import { spanOf } from "./span";

export type FragmentTable = Map<string, AstFragmentDeclaration>;

export type FlattenedBody = {
  selectedFields: string[];
  expansions: Expansion[];
};

type BodyItem =
  | { kind: "field"; name: string; span: SourceSpan | null }
  | { kind: "expansion"; expansion: AstExpansion }
  | { kind: "spread"; spread: AstFragmentSpread };

/** AST nodes that own a mixed field / expand / spread body. */
type BodyContainer = AstProjectionClause | AstProjectionWhenArm | AstFragmentDeclaration;

const EMPTY_BODY: FlattenedBody = { selectedFields: [], expansions: [] };

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
  sink: DiagnosticSink
): FlattenedBody {
  const selectedFields: string[] = [];
  const expansions: Expansion[] = [];
  const seenFields = new Set<string>();
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
    } else {
      const spreadBody = expandSpread(item.spread, resource, binding, fragments, stack, sink);
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
    }
  }

  return { selectedFields, expansions };
}

export function expandSpread(
  spread: AstFragmentSpread,
  resource: string,
  binding: string,
  fragments: FragmentTable,
  stack: string[],
  sink: DiagnosticSink
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

  const body = expandBody(frag, resource, binding, fragments, [...stack, name], sink);
  return {
    selectedFields: body.selectedFields,
    expansions: body.expansions.map((e) => rebindExpansion(e, frag.binding, binding)),
  };
}

/**
 * Recover source order of fields / expands / spreads from CST.
 * Langium stores the three alternatives in separate arrays.
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

  const fieldQueue = [...container.selectedFields];
  const ordered: { offset: number; item: BodyItem }[] = [];
  const seenOffsets = new Set<number>();

  const cst = container.$cstNode;
  const content = cst && isCompositeCstNode(cst) ? cst.content : [];

  for (const child of content) {
    // Skip nested when-arm subtrees when walking a projection clause. Leaves
    // inside a when-arm still have `$type === "ProjectionWhenArm"` but share
    // the arm as `astNode` — those must not be skipped.
    if (child.astNode?.$type === "ProjectionWhenArm" && child.astNode !== container) {
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
    case "binary":
      return {
        ...expr,
        left: rebindExpr(expr.left, from, to),
        right: rebindExpr(expr.right, from, to),
      };
  }
}
