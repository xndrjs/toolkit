/**
 * Ziel document formatter — Langium AbstractFormatter (no Prettier).
 * Style: 2-space indent (via LSP options), blank line between top-level decls
 * and query sections / when arms, multiline constructions (2+ args),
 * `and`/`or` broken across lines, braced blocks with indented interiors.
 */
import type { AstNode } from "langium";
import { AbstractFormatter, Formatting, type FormattingAction } from "langium/lsp";

import {
  isArrayLiteral,
  isBinaryExpr,
  isContextBlock,
  isDatasourceDeclaration,
  isDatasourceRoute,
  isEachComprehension,
  isExcludeClause,
  isExpandArm,
  isExpansion,
  isFragmentDeclaration,
  isGroupedExpr,
  isIslandClause,
  isIslandsBlock,
  isModel,
  isNamedArg,
  isObjectField,
  isObjectTypeExpr,
  isProjectionClause,
  isProjectionDefaultArm,
  isProjectionWhenArm,
  isQueryDeclaration,
  isRefersClause,
  isRefersPatternField,
  isRefersTarget,
  isResolveArm,
  isResourceConstruction,
  isResourceDeclaration,
  isRootClause,
  isRootEntry,
  isRootsBlock,
  isScalarDeclaration,
  isTypedField,
  isUnaryExpr,
  isUnionTypeExpr,
} from "../lang/generated/ast";

/** Blank line + one indent level (overrides interior `indent` when priority is higher). */
const blankLineIndent: FormattingAction = {
  options: { priority: 1 },
  moves: [{ lines: 2, tabs: 1 }],
};

export class ZielFormatter extends AbstractFormatter {
  /**
   * Indented body inside `{ … }`. Callers ensure a space before `{` if needed.
   * Empty blocks format as `{ }` (space before `}`, no newline).
   */
  private formatBracedBlock(node: AstNode, empty = false): void {
    const f = this.getNodeFormatter(node);
    const open = f.keyword("{");
    const close = f.keyword("}");
    if (empty) {
      close.prepend(Formatting.oneSpace());
      return;
    }
    f.interior(open, close).prepend(Formatting.indent());
    close.prepend(Formatting.newLine());
  }

  /** Multiline `( a, b )` — each child on its own indented line. */
  private formatMultilineParens(node: AstNode, children: AstNode[]): void {
    const f = this.getNodeFormatter(node);
    f.keyword("(").prepend(Formatting.noSpace()).append(Formatting.noSpace());
    for (const child of children) {
      f.node(child).prepend(Formatting.indent());
    }
    f.keywords(",").prepend(Formatting.noSpace());
    f.keyword(")").prepend(Formatting.newLine());
  }

  protected format(node: AstNode): void {
    if (isModel(node)) {
      const f = this.getNodeFormatter(node);
      for (let i = 1; i < node.declarations.length; i++) {
        f.node(node.declarations[i]!).prepend(Formatting.newLines(2));
      }
      return;
    }

    if (isScalarDeclaration(node)) {
      const f = this.getNodeFormatter(node);
      f.keyword("scalar").append(Formatting.oneSpace());
      f.keyword("on").surround(Formatting.oneSpace());
      f.keyword(";").prepend(Formatting.noSpace());
      return;
    }

    if (isResourceDeclaration(node)) {
      const f = this.getNodeFormatter(node);
      f.keyword("resource").append(Formatting.oneSpace());
      f.keyword(":").prepend(Formatting.noSpace()).append(Formatting.oneSpace());
      if (node.identity.length >= 2) {
        this.formatMultilineParens(node, node.identity);
      } else {
        f.keyword("(").prepend(Formatting.noSpace()).append(Formatting.noSpace());
        f.keyword(")").prepend(Formatting.noSpace());
        f.keywords(",").prepend(Formatting.noSpace()).append(Formatting.oneSpace());
      }
      return;
    }

    if (isTypedField(node)) {
      const f = this.getNodeFormatter(node);
      f.keyword(":").prepend(Formatting.noSpace()).append(Formatting.oneSpace());
      return;
    }

    if (isObjectTypeExpr(node)) {
      const f = this.getNodeFormatter(node);
      const open = f.keyword("{");
      const close = f.keyword("}");
      close.prepend(Formatting.newLine());
      for (const field of node.fields) {
        f.node(field).prepend(Formatting.indent());
      }
      f.keywords(";", ",").prepend(Formatting.noSpace());
      return;
    }

    if (isObjectField(node)) {
      const f = this.getNodeFormatter(node);
      f.keyword(":").prepend(Formatting.noSpace()).append(Formatting.oneSpace());
      return;
    }

    if (isRefersClause(node)) {
      const f = this.getNodeFormatter(node);
      f.keyword("refers").append(Formatting.oneSpace());
      f.keywords("|").surround(Formatting.oneSpace());
      return;
    }

    if (isRefersTarget(node)) {
      const f = this.getNodeFormatter(node);
      f.keyword("with").surround(Formatting.oneSpace());
      this.formatBracedBlock(node);
      f.keywords(",").prepend(Formatting.noSpace()).append(Formatting.oneSpace());
      return;
    }

    if (isRefersPatternField(node)) {
      const f = this.getNodeFormatter(node);
      f.keyword(":").prepend(Formatting.noSpace()).append(Formatting.oneSpace());
      f.keywords("|").surround(Formatting.oneSpace());
      return;
    }

    if (isUnionTypeExpr(node)) {
      const f = this.getNodeFormatter(node);
      f.keywords("|").surround(Formatting.oneSpace());
      return;
    }

    if (isFragmentDeclaration(node)) {
      const f = this.getNodeFormatter(node);
      f.keyword("fragment").append(Formatting.oneSpace());
      f.keyword("on").surround(Formatting.oneSpace());
      f.property("binding").append(Formatting.oneSpace());
      if (node.when) {
        f.keyword("when").surround(Formatting.oneSpace());
        f.keyword("{").prepend(Formatting.oneSpace());
      }
      this.formatBracedBlock(node);
      return;
    }

    if (isQueryDeclaration(node)) {
      const f = this.getNodeFormatter(node);
      f.keyword("query").append(Formatting.oneSpace());
      f.keyword("(").prepend(Formatting.noSpace()).append(Formatting.noSpace());
      f.keyword(")").prepend(Formatting.noSpace()).append(Formatting.oneSpace());
      f.keywords(",").prepend(Formatting.noSpace()).append(Formatting.oneSpace());
      this.formatBracedBlock(node);
      const sections = [
        node.context,
        node.root ?? node.roots,
        ...node.projections,
        node.islands,
      ].filter((s): s is NonNullable<typeof s> => s != null);
      for (let i = 1; i < sections.length; i++) {
        f.node(sections[i]!).prepend(blankLineIndent);
      }
      return;
    }

    if (isDatasourceDeclaration(node)) {
      const f = this.getNodeFormatter(node);
      f.keyword("datasource").append(Formatting.oneSpace());
      f.property("name").append(Formatting.oneSpace());
      this.formatBracedBlock(node);
      if (node.context && node.routes.length > 0) {
        f.node(node.routes[0]!).prepend(blankLineIndent);
      }
      for (let i = 1; i < node.routes.length; i++) {
        f.node(node.routes[i]!).prepend(Formatting.indent());
      }
      return;
    }

    if (isDatasourceRoute(node)) {
      const f = this.getNodeFormatter(node);
      f.keyword("for").append(Formatting.oneSpace());
      if (node.when) {
        f.keyword("when").surround(Formatting.oneSpace());
      }
      return;
    }

    if (isContextBlock(node)) {
      const f = this.getNodeFormatter(node);
      f.keyword("context").append(Formatting.oneSpace());
      this.formatBracedBlock(node);
      return;
    }

    if (isRootClause(node)) {
      const f = this.getNodeFormatter(node);
      f.keyword("root").append(Formatting.oneSpace());
      return;
    }

    if (isRootsBlock(node)) {
      const f = this.getNodeFormatter(node);
      f.keyword("roots").append(Formatting.oneSpace());
      this.formatBracedBlock(node);
      for (const entry of node.entries) {
        f.node(entry).prepend(Formatting.indent());
      }
      return;
    }

    if (isRootEntry(node)) {
      const f = this.getNodeFormatter(node);
      f.keyword(":").prepend(Formatting.noSpace()).append(Formatting.oneSpace());
      return;
    }

    if (isIslandsBlock(node)) {
      const f = this.getNodeFormatter(node);
      f.keyword("islands").append(Formatting.oneSpace());
      this.formatBracedBlock(node);
      return;
    }

    if (isIslandClause(node)) {
      const f = this.getNodeFormatter(node);
      f.keyword("on").append(Formatting.oneSpace());
      if (node.when) {
        f.keyword("when").surround(Formatting.oneSpace());
      }
      return;
    }

    if (isProjectionClause(node)) {
      const f = this.getNodeFormatter(node);
      f.keyword("on").append(Formatting.oneSpace());
      f.property("binding").append(Formatting.oneSpace());
      if (node.resolveArms.length > 0) {
        f.keyword("resolve").surround(Formatting.oneSpace());
        f.keyword("to").append(Formatting.oneSpace());
        this.formatBracedBlock(node);
        for (let i = 1; i < node.resolveArms.length; i++) {
          f.node(node.resolveArms[i]!).prepend(blankLineIndent);
        }
      } else {
        if (node.include) {
          f.keyword("include").surround(Formatting.oneSpace());
          if (node.include.includes("properties")) {
            f.keyword("properties").append(Formatting.oneSpace());
          } else if (node.include.includes("none")) {
            f.keyword("none").append(Formatting.oneSpace());
          } else {
            f.keyword("all").append(Formatting.oneSpace());
          }
        }
        const empty =
          node.selectedFields.length === 0 &&
          node.expansions.length === 0 &&
          node.spreads.length === 0 &&
          node.excludes.length === 0 &&
          node.whenArms.length === 0 &&
          !node.defaultArm;
        this.formatBracedBlock(node, empty);
        const preceding =
          node.selectedFields.length +
          node.expansions.length +
          node.spreads.length +
          node.excludes.length;
        if (preceding > 0 && node.whenArms.length > 0) {
          f.node(node.whenArms[0]!).prepend(blankLineIndent);
        }
        for (let i = 1; i < node.whenArms.length; i++) {
          f.node(node.whenArms[i]!).prepend(blankLineIndent);
        }
        if (node.defaultArm) {
          const blankBeforeDefault =
            preceding > 0 || node.whenArms.length > 0 ? blankLineIndent : Formatting.indent();
          f.node(node.defaultArm).prepend(blankBeforeDefault);
        }
      }
      return;
    }

    if (isProjectionWhenArm(node) || isProjectionDefaultArm(node)) {
      const f = this.getNodeFormatter(node);
      if (isProjectionWhenArm(node)) {
        f.keyword("when").append(Formatting.oneSpace());
      } else {
        f.keyword("default");
      }
      if (node.include) {
        f.keyword("include").surround(Formatting.oneSpace());
        if (node.include.includes("properties")) {
          f.keyword("properties").append(Formatting.oneSpace());
        } else if (node.include.includes("none")) {
          f.keyword("none").append(Formatting.oneSpace());
        } else {
          f.keyword("all").append(Formatting.oneSpace());
        }
      } else {
        f.keyword("{").prepend(Formatting.oneSpace());
      }
      const empty =
        node.selectedFields.length === 0 &&
        node.expansions.length === 0 &&
        node.spreads.length === 0 &&
        node.excludes.length === 0;
      this.formatBracedBlock(node, empty);
      return;
    }

    if (isExcludeClause(node)) {
      const f = this.getNodeFormatter(node);
      f.keyword("exclude").append(Formatting.oneSpace());
      return;
    }

    if (isResolveArm(node)) {
      const f = this.getNodeFormatter(node);
      if (node.when) {
        f.keyword("when").surround(Formatting.oneSpace());
      }
      return;
    }

    if (isExpansion(node)) {
      const f = this.getNodeFormatter(node);
      f.keyword("expand").append(Formatting.oneSpace());
      f.keyword(":").prepend(Formatting.noSpace()).append(Formatting.oneSpace());
      return;
    }

    if (isEachComprehension(node)) {
      const f = this.getNodeFormatter(node);
      f.keyword("each").append(Formatting.oneSpace());
      f.keyword("in").surround(Formatting.oneSpace());
      // Always wrap arms: `each x in ys (\n  Arm\n)`
      f.keyword("(").prepend(Formatting.oneSpace()).append(Formatting.noSpace());
      for (const arm of node.arms) {
        f.node(arm).prepend(Formatting.indent());
      }
      f.keywords(",").prepend(Formatting.noSpace());
      f.keyword(")").prepend(Formatting.newLine());
      return;
    }

    if (isExpandArm(node)) {
      const f = this.getNodeFormatter(node);
      if (node.when) {
        f.keyword("when").surround(Formatting.oneSpace());
      }
      return;
    }

    if (isResourceConstruction(node)) {
      const f = this.getNodeFormatter(node);
      if (node.args.length >= 2) {
        this.formatMultilineParens(node, node.args);
      } else {
        f.keyword("(").prepend(Formatting.noSpace()).append(Formatting.noSpace());
        f.keyword(")").prepend(Formatting.noSpace());
        f.keywords(",").prepend(Formatting.noSpace()).append(Formatting.oneSpace());
      }
      return;
    }

    if (isNamedArg(node)) {
      const f = this.getNodeFormatter(node);
      f.keyword(":").prepend(Formatting.noSpace()).append(Formatting.oneSpace());
      return;
    }

    if (isBinaryExpr(node)) {
      const f = this.getNodeFormatter(node);
      if (node.op === "and" || node.op === "or") {
        // Break before the operator: `left\n  or right`
        f.keyword(node.op).prepend(Formatting.indent()).append(Formatting.oneSpace());
      } else {
        f.keywords("==", "!=", "in", "not").surround(Formatting.oneSpace());
      }
      return;
    }

    if (isUnaryExpr(node) && node.$type === "UnaryExpr" && node.op === "!") {
      const f = this.getNodeFormatter(node);
      f.keyword("!").append(Formatting.noSpace());
      return;
    }

    if (isGroupedExpr(node)) {
      const f = this.getNodeFormatter(node);
      f.keyword("(").append(Formatting.noSpace());
      f.keyword(")").prepend(Formatting.noSpace());
      return;
    }

    if (isArrayLiteral(node)) {
      const f = this.getNodeFormatter(node);
      f.keyword("[").append(Formatting.noSpace());
      f.keyword("]").prepend(Formatting.noSpace());
      f.keywords(",").prepend(Formatting.noSpace()).append(Formatting.oneSpace());
    }
  }
}
