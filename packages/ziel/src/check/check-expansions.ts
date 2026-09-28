import type { ExpandArm, Expansion, SourceSpan, TypeExpr } from "../ir";
import { checkConstruction } from "./construction";
import type { DiagnosticSink } from "./diagnostic";
import { formatType } from "./assignability";
import { narrowItemTypeByFilter, payloadHasField } from "./discriminants";
import { inferExprType } from "./expressions";
import { unwrapNullable, type QueryScope, type ResourceTable, type ScalarTable } from "./symbols";

export function checkSelectedFields(
  selectedFields: string[],
  payloadType: TypeExpr,
  resourceName: string,
  basePath: string,
  span: SourceSpan | null,
  resources: ResourceTable,
  sink: DiagnosticSink
): void {
  for (const fieldName of selectedFields) {
    if (!payloadHasField(payloadType, fieldName, resources)) {
      const unwrapped = unwrapNullable(payloadType);
      if (
        unwrapped.kind !== "object" &&
        unwrapped.kind !== "union" &&
        unwrapped.kind !== "resourceRef"
      ) {
        sink.push({
          code: "UNKNOWN_SELECTED_FIELD",
          message: `Cannot select field '${fieldName}' on non-object payload of '${resourceName}'`,
          path: `${basePath}.selectedFields.${fieldName}`,
          span,
        });
      } else {
        sink.push({
          code: "UNKNOWN_SELECTED_FIELD",
          message: `Selected field '${fieldName}' is not on payload of '${resourceName}'`,
          path: `${basePath}.selectedFields.${fieldName}`,
          span,
        });
      }
    }
  }
}

export function checkExpansions(
  expansions: Expansion[],
  basePath: string,
  scope: QueryScope,
  scalars: ScalarTable,
  resources: ResourceTable,
  sink: DiagnosticSink
): void {
  const aliases = new Set<string>();
  for (const expansion of expansions) {
    const expPath = `${basePath}.expansions.${expansion.alias}`;
    if (aliases.has(expansion.alias)) {
      sink.push({
        code: "DUPLICATE_EXPANSION_ALIAS",
        message: `Duplicate expansion alias '${expansion.alias}'`,
        path: expPath,
        span: expansion.span,
      });
      continue;
    }
    aliases.add(expansion.alias);

    if (expansion.multiplicity === "many") {
      checkManyExpansion(expansion, expPath, scope, scalars, resources, sink);
    } else {
      if (expansion.comprehension !== null) {
        sink.push({
          code: "INVALID_COMPREHENSION",
          message: `Expansion '${expansion.alias}' has multiplicity "one" but includes a comprehension`,
          path: expPath,
          span: expansion.span,
        });
      }
      if (expansion.target === null) {
        sink.push({
          code: "INVALID_COMPREHENSION",
          message: `Expansion '${expansion.alias}' has multiplicity "one" but no target`,
          path: expPath,
          span: expansion.span,
        });
        continue;
      }
      checkConstruction(expansion.target, expPath, scope, scalars, resources, sink);
      checkOnFailure(expansion.onFailure, `${expPath}.onFailure`, expansion.span, sink);
    }
  }
}

function checkOnFailure(
  onFailure: ExpandArm["onFailure"],
  path: string,
  span: SourceSpan | null,
  sink: DiagnosticSink
): void {
  if (onFailure === "throw" || onFailure === "setNull" || onFailure === "setError") {
    return;
  }
  sink.push({
    code: "INVALID_ON_FAILURE",
    message: `Invalid on-failure policy '${String(onFailure)}' (expected throw | set null | set error)`,
    path,
    span,
  });
}

export function checkManyExpansion(
  expansion: Expansion,
  expPath: string,
  scope: QueryScope,
  scalars: ScalarTable,
  resources: ResourceTable,
  sink: DiagnosticSink
): void {
  const comprehension = expansion.comprehension;
  if (!comprehension) {
    sink.push({
      code: "INVALID_COMPREHENSION",
      message: `Expansion '${expansion.alias}' has multiplicity "many" but no comprehension`,
      path: expPath,
      span: expansion.span,
    });
    return;
  }

  if (comprehension.arms.length === 0) {
    sink.push({
      code: "INVALID_COMPREHENSION",
      message: `Expansion '${expansion.alias}' each-comprehension has no arms`,
      path: expPath,
      span: expansion.span,
    });
    return;
  }

  const sourceType = inferExprType(
    comprehension.source,
    `${expPath}.source`,
    scope,
    resources,
    sink
  );
  if (!sourceType) {
    return;
  }

  const unwrapped = unwrapNullable(sourceType);
  if (unwrapped.kind !== "array") {
    sink.push({
      code: "COMPREHENSION_SOURCE_NOT_ARRAY",
      message: `Comprehension source must be an array, got ${formatType(sourceType)}`,
      path: `${expPath}.source`,
      span: comprehension.source.span,
    });
    return;
  }

  const elementType = unwrapped.of;

  for (let i = 0; i < comprehension.arms.length; i++) {
    checkExpandArm(
      comprehension.arms[i]!,
      `${expPath}.arms.${i}`,
      comprehension.itemBinding,
      elementType,
      scope,
      scalars,
      resources,
      sink
    );
  }
}

export function checkExpandArm(
  arm: ExpandArm,
  armPath: string,
  itemBinding: string,
  elementType: TypeExpr,
  scope: QueryScope,
  scalars: ScalarTable,
  resources: ResourceTable,
  sink: DiagnosticSink
): void {
  let itemType = elementType;
  if (arm.when) {
    const whenScope: QueryScope = {
      ...scope,
      items: new Map([[itemBinding, elementType]]),
    };
    const whenType = inferExprType(arm.when, `${armPath}.when`, whenScope, resources, sink);
    if (whenType) {
      const prim = unwrapNullable(whenType);
      if (prim.kind !== "primitive" || prim.name !== "boolean") {
        sink.push({
          code: "TYPE_MISMATCH",
          message: `Arm when-clause must be boolean, got ${formatType(whenType)}`,
          path: `${armPath}.when`,
          span: arm.when.span,
        });
      }
    }
    const narrowed = narrowItemTypeByFilter(elementType, arm.when, itemBinding);
    if (narrowed) {
      itemType = narrowed;
    }
  }

  const bodyScope: QueryScope = {
    ...scope,
    items: new Map([[itemBinding, itemType]]),
  };
  checkConstruction(arm.target, armPath, bodyScope, scalars, resources, sink);
  checkOnFailure(arm.onFailure, `${armPath}.onFailure`, arm.target.span, sink);
}
