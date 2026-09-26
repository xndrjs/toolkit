import type { FieldDecl, Program, TypeExpr } from "../ir";
import { formatType, objectPayloadFields, typesSemanticallyEqual } from "./assignability";
import type { DiagnosticSink } from "./diagnostic";
import {
  checkTypeExpr,
  checkUniqueFields,
  concreteType,
  type ResourceTable,
  type ScalarTable,
} from "./symbols";
import { isPrimitiveTypeName } from "./assignability";

export function collectScalars(program: Program, sink: DiagnosticSink): ScalarTable {
  const scalars: ScalarTable = new Map();
  for (const scalar of program.scalars) {
    const path = `scalars.${scalar.name}`;
    if (scalars.has(scalar.name)) {
      sink.push({
        code: "DUPLICATE_SCALAR",
        message: `Duplicate scalar '${scalar.name}'`,
        path,
        span: scalar.span,
      });
      continue;
    }
    if (!isPrimitiveTypeName(scalar.representation)) {
      sink.push({
        code: "INVALID_SCALAR_REPRESENTATION",
        message: `Scalar '${scalar.name}' representation must be string, number, or boolean`,
        path,
        span: scalar.span,
      });
    }
    scalars.set(scalar.name, scalar);
  }
  return scalars;
}

export function collectResources(
  program: Program,
  scalars: ScalarTable,
  sink: DiagnosticSink
): ResourceTable {
  // First pass: register names so payload `resourceRef` can resolve forward refs.
  const resources: ResourceTable = new Map();
  for (const resource of program.resources) {
    const path = `resources.${resource.name}`;
    if (resources.has(resource.name)) {
      sink.push({
        code: "DUPLICATE_RESOURCE",
        message: `Duplicate resource '${resource.name}'`,
        path,
        span: resource.span,
      });
      continue;
    }
    resources.set(resource.name, {
      identity: new Map(),
      payload: new Map(),
      payloadType: resource.payloadType,
    });
  }

  for (const resource of program.resources) {
    if (!resources.has(resource.name)) continue;
    const path = `resources.${resource.name}`;

    const identity = checkUniqueFields(
      resource.identity.fields,
      `${path}.identity`,
      "DUPLICATE_IDENTITY_FIELD",
      "identity",
      sink
    );

    for (const field of resource.identity.fields) {
      checkTypeExpr(field.type, `${path}.identity.${field.name}`, scalars, resources, sink);
    }

    checkPayloadType(
      resource.payloadType,
      `${path}.payloadType`,
      identity,
      scalars,
      resources,
      sink
    );

    const payloadFields = objectPayloadFields(resource.payloadType);
    const payload = checkUniqueFields(
      payloadFields,
      `${path}.payload`,
      "DUPLICATE_PAYLOAD_FIELD",
      "payload",
      sink
    );

    checkObjectPayloadShorthand(
      payloadFields,
      identity,
      resource.name,
      path,
      scalars,
      resources,
      sink
    );

    resources.set(resource.name, {
      identity,
      payload,
      payloadType: resource.payloadType,
    });
  }
  return resources;
}

function checkPayloadType(
  type: TypeExpr,
  path: string,
  _identity: Map<string, FieldDecl>,
  scalars: ScalarTable,
  resources: ResourceTable,
  sink: DiagnosticSink
): void {
  checkTypeExpr(type, path, scalars, resources, sink);

  // Nested object fields must not use identity shorthand (only root resource object payload).
  if (type.kind === "object") {
    for (const field of type.fields) {
      walkForbidNestedShorthand(field.type, `${path}.${field.name}`, sink);
    }
  }
}

function walkForbidNestedShorthand(type: TypeExpr, path: string, sink: DiagnosticSink): void {
  if (type.kind === "object") {
    for (const field of type.fields) {
      if (field.inheritedFromIdentity) {
        sink.push({
          code: "SHORTHAND_IN_NESTED_OBJECT",
          message: `Payload shorthand '${field.name}' is only allowed on a resource's root object payload`,
          path: `${path}.${field.name}`,
          span: field.span,
        });
      }
      walkForbidNestedShorthand(field.type, `${path}.${field.name}`, sink);
    }
  } else if (type.kind === "array" || type.kind === "nullable") {
    walkForbidNestedShorthand(type.of, path, sink);
  } else if (type.kind === "union") {
    for (let i = 0; i < type.members.length; i++) {
      walkForbidNestedShorthand(type.members[i]!, `${path}|${i}`, sink);
    }
  }
}

function checkObjectPayloadShorthand(
  payloadFields: FieldDecl[],
  identity: Map<string, FieldDecl>,
  resourceName: string,
  path: string,
  scalars: ScalarTable,
  resources: ResourceTable,
  sink: DiagnosticSink
): void {
  for (const field of payloadFields) {
    const fieldPath = `${path}.payload.${field.name}`;
    const identityField = identity.get(field.name);
    if (field.inheritedFromIdentity) {
      if (!identityField) {
        sink.push({
          code: "SHORTHAND_NO_IDENTITY",
          message: `Payload shorthand '${field.name}' has no matching identity field on '${resourceName}'`,
          path: fieldPath,
          span: field.span,
        });
      } else {
        const left = concreteType(field.type, fieldPath, scalars, resources, sink);
        const right = concreteType(identityField.type, fieldPath, scalars, resources, sink);
        if (left && right && !typesSemanticallyEqual(left, right)) {
          sink.push({
            code: "IDENTITY_PAYLOAD_TYPE_MISMATCH",
            message: `Payload shorthand '${field.name}' type ${formatType(field.type)} is incompatible with identity type ${formatType(identityField.type)}`,
            path: fieldPath,
            span: field.span,
          });
        }
      }
    } else if (identityField) {
      const left = concreteType(field.type, fieldPath, scalars, resources, sink);
      const right = concreteType(identityField.type, fieldPath, scalars, resources, sink);
      if (left && right && !typesSemanticallyEqual(left, right)) {
        sink.push({
          code: "IDENTITY_PAYLOAD_TYPE_MISMATCH",
          message: `Identity and payload field '${field.name}' have incompatible types (${formatType(identityField.type)} vs ${formatType(field.type)})`,
          path: fieldPath,
          span: field.span,
        });
      }
    }
  }
}
