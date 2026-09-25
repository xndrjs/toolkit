import type {
  Expr,
  FieldDecl,
  Program,
  ResourceConstruction,
  ScalarDefinition,
  StrategyDefinition,
  TypeExpr,
} from "../ir";
import {
  formatType,
  isAssignable,
  isPrimitiveTypeName,
  literalInhabits,
  typesSemanticallyEqual,
} from "./assignability";
import { createDiagnosticSink, type Diagnostic, type DiagnosticSink } from "./diagnostic";

type FieldMap = Map<string, FieldDecl>;

type ResourceSymbols = {
  identity: FieldMap;
  payload: FieldMap;
};

type StrategyScope = {
  path: string;
  params: FieldMap;
  context: FieldMap;
  /** Projection binding → resource name */
  bindings: Map<string, string>;
};

/**
 * Check a NaviQL program. Returns all diagnostics (does not throw).
 */
export function checkProgram(program: Program): Diagnostic[] {
  const sink = createDiagnosticSink();
  const scalars = collectScalars(program, sink);
  const resources = collectResources(program, scalars, sink);

  for (const scalar of program.scalars) {
    if (resources.has(scalar.name)) {
      sink.push({
        code: "SCALAR_RESOURCE_NAME_CLASH",
        message: `Scalar '${scalar.name}' clashes with a resource of the same name`,
        path: `scalars.${scalar.name}`,
      });
    }
  }

  const strategyNames = new Set<string>();
  for (const strategy of program.strategies) {
    const path = `strategies.${strategy.name}`;
    if (strategyNames.has(strategy.name)) {
      sink.push({
        code: "DUPLICATE_STRATEGY",
        message: `Duplicate strategy '${strategy.name}'`,
        path,
      });
      continue;
    }
    strategyNames.add(strategy.name);
    checkStrategy(strategy, path, scalars, resources, sink);
  }

  return sink.diagnostics;
}

function collectScalars(program: Program, sink: DiagnosticSink): Map<string, ScalarDefinition> {
  const scalars = new Map<string, ScalarDefinition>();
  for (const scalar of program.scalars) {
    const path = `scalars.${scalar.name}`;
    if (scalars.has(scalar.name)) {
      sink.push({
        code: "DUPLICATE_SCALAR",
        message: `Duplicate scalar '${scalar.name}'`,
        path,
      });
      continue;
    }
    if (!isPrimitiveTypeName(scalar.representation)) {
      sink.push({
        code: "INVALID_SCALAR_REPRESENTATION",
        message: `Scalar '${scalar.name}' representation must be string, number, or boolean`,
        path,
      });
    }
    scalars.set(scalar.name, scalar);
  }
  return scalars;
}

function collectResources(
  program: Program,
  scalars: Map<string, ScalarDefinition>,
  sink: DiagnosticSink
): Map<string, ResourceSymbols> {
  const resources = new Map<string, ResourceSymbols>();
  for (const resource of program.resources) {
    const path = `resources.${resource.name}`;
    if (resources.has(resource.name)) {
      sink.push({
        code: "DUPLICATE_RESOURCE",
        message: `Duplicate resource '${resource.name}'`,
        path,
      });
      continue;
    }

    const identity = checkUniqueFields(
      resource.identity.fields,
      `${path}.identity`,
      "DUPLICATE_IDENTITY_FIELD",
      "identity",
      sink
    );
    const payload = checkUniqueFields(
      resource.payload.fields,
      `${path}.payload`,
      "DUPLICATE_PAYLOAD_FIELD",
      "payload",
      sink
    );

    for (const field of resource.identity.fields) {
      checkTypeExpr(field.type, `${path}.identity.${field.name}`, scalars, sink);
    }
    for (const field of resource.payload.fields) {
      const fieldPath = `${path}.payload.${field.name}`;
      checkTypeExpr(field.type, fieldPath, scalars, sink);

      const identityField = identity.get(field.name);
      if (field.inheritedFromIdentity) {
        if (!identityField) {
          sink.push({
            code: "SHORTHAND_NO_IDENTITY",
            message: `Payload shorthand '${field.name}' has no matching identity field on '${resource.name}'`,
            path: fieldPath,
          });
        } else if (!typesSemanticallyEqual(field.type, identityField.type)) {
          sink.push({
            code: "IDENTITY_PAYLOAD_TYPE_MISMATCH",
            message: `Payload shorthand '${field.name}' type ${formatType(field.type)} is incompatible with identity type ${formatType(identityField.type)}`,
            path: fieldPath,
          });
        }
      } else if (identityField && !typesSemanticallyEqual(field.type, identityField.type)) {
        sink.push({
          code: "IDENTITY_PAYLOAD_TYPE_MISMATCH",
          message: `Identity and payload field '${field.name}' have incompatible types (${formatType(identityField.type)} vs ${formatType(field.type)})`,
          path: fieldPath,
        });
      }
    }

    resources.set(resource.name, { identity, payload });
  }
  return resources;
}

function checkUniqueFields(
  fields: FieldDecl[],
  basePath: string,
  code: string,
  label: string,
  sink: DiagnosticSink
): FieldMap {
  const map: FieldMap = new Map();
  for (const field of fields) {
    if (map.has(field.name)) {
      sink.push({
        code,
        message: `Duplicate ${label} field '${field.name}'`,
        path: `${basePath}.${field.name}`,
      });
      continue;
    }
    map.set(field.name, field);
  }
  return map;
}

function checkTypeExpr(
  type: TypeExpr,
  path: string,
  scalars: Map<string, ScalarDefinition>,
  sink: DiagnosticSink
): void {
  switch (type.kind) {
    case "primitive":
      return;
    case "scalarRef":
      if (!scalars.has(type.name)) {
        sink.push({
          code: "UNKNOWN_SCALAR",
          message: `Unknown scalar '${type.name}'`,
          path,
        });
      }
      return;
    case "nullable":
    case "array":
      checkTypeExpr(type.of, path, scalars, sink);
      return;
    case "object":
      for (const field of type.fields) {
        checkTypeExpr(field.type, `${path}.${field.name}`, scalars, sink);
      }
      return;
  }
}

function checkStrategy(
  strategy: StrategyDefinition,
  path: string,
  scalars: Map<string, ScalarDefinition>,
  resources: Map<string, ResourceSymbols>,
  sink: DiagnosticSink
): void {
  const params = checkUniqueFields(
    strategy.parameters,
    `${path}.parameters`,
    "DUPLICATE_PARAM",
    "parameter",
    sink
  );
  const context = checkUniqueFields(
    strategy.context,
    `${path}.context`,
    "DUPLICATE_CONTEXT_FIELD",
    "context",
    sink
  );

  for (const field of strategy.parameters) {
    checkTypeExpr(field.type, `${path}.parameters.${field.name}`, scalars, sink);
  }
  for (const field of strategy.context) {
    checkTypeExpr(field.type, `${path}.context.${field.name}`, scalars, sink);
  }

  const bindings = new Map<string, string>();
  for (let i = 0; i < strategy.projections.length; i++) {
    const projection = strategy.projections[i]!;
    const projPath = `${path}.projections.${projection.binding || i}`;
    if (bindings.has(projection.binding)) {
      sink.push({
        code: "DUPLICATE_BINDING",
        message: `Duplicate projection binding '${projection.binding}' in strategy '${strategy.name}'`,
        path: projPath,
      });
      continue;
    }
    if (!resources.has(projection.resource)) {
      sink.push({
        code: "UNKNOWN_RESOURCE",
        message: `Unknown resource '${projection.resource}' in projection`,
        path: projPath,
      });
    }
    bindings.set(projection.binding, projection.resource);
  }

  const scope: StrategyScope = {
    path,
    params,
    context,
    bindings,
  };

  checkConstruction(strategy.root, `${path}.root`, scope, scalars, resources, sink);

  for (const projection of strategy.projections) {
    const projPath = `${path}.projections.${projection.binding}`;
    const resource = resources.get(projection.resource);
    if (!resource) {
      continue;
    }

    for (const fieldName of projection.selectedFields) {
      if (!resource.payload.has(fieldName)) {
        sink.push({
          code: "UNKNOWN_SELECTED_FIELD",
          message: `Selected field '${fieldName}' is not on payload of '${projection.resource}'`,
          path: `${projPath}.selectedFields.${fieldName}`,
        });
      }
    }

    const aliases = new Set<string>();
    for (const expansion of projection.expansions) {
      const expPath = `${projPath}.expansions.${expansion.alias}`;
      if (aliases.has(expansion.alias)) {
        sink.push({
          code: "DUPLICATE_EXPANSION_ALIAS",
          message: `Duplicate expansion alias '${expansion.alias}'`,
          path: expPath,
        });
        continue;
      }
      aliases.add(expansion.alias);
      checkConstruction(expansion.target, expPath, scope, scalars, resources, sink);
    }
  }
}

function checkConstruction(
  construction: ResourceConstruction,
  path: string,
  scope: StrategyScope,
  scalars: Map<string, ScalarDefinition>,
  resources: Map<string, ResourceSymbols>,
  sink: DiagnosticSink
): void {
  const resource = resources.get(construction.resource);
  if (!resource) {
    sink.push({
      code: "UNKNOWN_RESOURCE",
      message: `Unknown resource '${construction.resource}'`,
      path,
    });
    for (const arg of construction.args) {
      inferExprType(arg.value, `${path}.args.${arg.name}`, scope, resources, sink);
    }
    return;
  }

  const seenArgs = new Set<string>();
  for (const arg of construction.args) {
    const argPath = `${path}.args.${arg.name}`;
    if (seenArgs.has(arg.name)) {
      sink.push({
        code: "DUPLICATE_CONSTRUCTOR_ARG",
        message: `Duplicate constructor argument '${arg.name}'`,
        path: argPath,
      });
      continue;
    }
    seenArgs.add(arg.name);

    const identityField = resource.identity.get(arg.name);
    if (!identityField) {
      sink.push({
        code: "UNKNOWN_CONSTRUCTOR_ARG",
        message: `Unknown identity argument '${arg.name}' for resource '${construction.resource}'`,
        path: argPath,
      });
      inferExprType(arg.value, argPath, scope, resources, sink);
      continue;
    }

    checkExprAssignableTo(arg.value, identityField.type, argPath, scope, scalars, resources, sink);
  }

  for (const [fieldName] of resource.identity) {
    if (!seenArgs.has(fieldName)) {
      sink.push({
        code: "MISSING_CONSTRUCTOR_ARG",
        message: `Missing required identity argument '${fieldName}' for resource '${construction.resource}'`,
        path,
      });
    }
  }
}

function checkExprAssignableTo(
  expr: Expr,
  expected: TypeExpr,
  path: string,
  scope: StrategyScope,
  scalars: Map<string, ScalarDefinition>,
  resources: Map<string, ResourceSymbols>,
  sink: DiagnosticSink
): void {
  if (expr.kind === "literal") {
    const ok = literalInhabits(expr.value, expected, (name) => scalars.get(name)?.representation);
    if (!ok) {
      sink.push({
        code: "TYPE_MISMATCH",
        message: `Literal is not assignable to ${formatType(expected)}`,
        path,
      });
    }
    return;
  }

  const actual = inferExprType(expr, path, scope, resources, sink);
  if (!actual) return;

  if (!isAssignable(actual, expected)) {
    sink.push({
      code: "TYPE_MISMATCH",
      message: `Type ${formatType(actual)} is not assignable to ${formatType(expected)}`,
      path,
    });
  }
}

/**
 * Infer the type of an expression. Returns `undefined` when already diagnosed
 * as invalid (unknown binding/path/etc.). Literals are treated as primitives
 * for orphan resolution; assignability uses `literalInhabits` instead.
 */
function inferExprType(
  expr: Expr,
  path: string,
  scope: StrategyScope,
  resources: Map<string, ResourceSymbols>,
  sink: DiagnosticSink
): TypeExpr | undefined {
  switch (expr.kind) {
    case "literal": {
      if (expr.value === null) {
        return {
          kind: "nullable",
          of: { kind: "primitive", name: "string", span: null },
          span: null,
        };
      }
      const name =
        typeof expr.value === "string"
          ? "string"
          : typeof expr.value === "number"
            ? "number"
            : "boolean";
      return { kind: "primitive", name, span: null };
    }
    case "param": {
      const field = scope.params.get(expr.name);
      if (!field) {
        sink.push({
          code: "UNKNOWN_PARAM",
          message: `Unknown parameter '${expr.name}'`,
          path,
        });
        return undefined;
      }
      return field.type;
    }
    case "context": {
      return resolvePathOnFields(
        expr.path,
        scope.context,
        path,
        "UNKNOWN_CONTEXT_PATH",
        "context",
        sink
      );
    }
    case "payloadRef": {
      return resolveBindingPath(expr.binding, expr.path, "payload", path, scope, resources, sink);
    }
    case "identityRef": {
      return resolveBindingPath(expr.binding, expr.path, "identity", path, scope, resources, sink);
    }
  }
}

function resolveBindingPath(
  binding: string,
  pathSegments: string[],
  side: "payload" | "identity",
  path: string,
  scope: StrategyScope,
  resources: Map<string, ResourceSymbols>,
  sink: DiagnosticSink
): TypeExpr | undefined {
  const resourceName = scope.bindings.get(binding);
  if (!resourceName) {
    sink.push({
      code: "UNKNOWN_BINDING",
      message: `Unknown binding '${binding}'`,
      path,
    });
    return undefined;
  }
  const resource = resources.get(resourceName);
  if (!resource) {
    return undefined;
  }
  const fields = side === "payload" ? resource.payload : resource.identity;
  const code = side === "payload" ? "UNKNOWN_PAYLOAD_PATH" : "UNKNOWN_IDENTITY_PATH";
  return resolvePathOnFields(pathSegments, fields, path, code, side, sink);
}

function resolvePathOnFields(
  pathSegments: string[],
  rootFields: FieldMap,
  diagPath: string,
  code: string,
  label: string,
  sink: DiagnosticSink
): TypeExpr | undefined {
  if (pathSegments.length === 0) {
    sink.push({
      code,
      message: `Empty ${label} path`,
      path: diagPath,
    });
    return undefined;
  }

  let fields: FieldMap | null = rootFields;
  let currentType: TypeExpr | undefined;

  for (let i = 0; i < pathSegments.length; i++) {
    const segment = pathSegments[i]!;
    if (!fields) {
      sink.push({
        code,
        message: `Cannot access '${segment}' on non-object ${label} type${currentType ? ` ${formatType(currentType)}` : ""}`,
        path: diagPath,
      });
      return undefined;
    }
    const field = fields.get(segment);
    if (!field) {
      sink.push({
        code,
        message: `Unknown ${label} path '${pathSegments.slice(0, i + 1).join(".")}'`,
        path: diagPath,
      });
      return undefined;
    }
    currentType = field.type;
    if (i < pathSegments.length - 1) {
      const inner = unwrapNullable(currentType);
      if (inner.kind === "object") {
        fields = new Map(inner.fields.map((f) => [f.name, f]));
      } else {
        fields = null;
      }
    }
  }

  return currentType;
}

function unwrapNullable(type: TypeExpr): TypeExpr {
  return type.kind === "nullable" ? unwrapNullable(type.of) : type;
}
