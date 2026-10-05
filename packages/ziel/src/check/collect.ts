import type { FieldDecl, Program, TypeExpr } from "../ir";
import { formatType, objectPayloadFields, typesSemanticallyEqual } from "./assignability";
import { expandPayloadObjectMembers } from "./discriminants";
import type { DiagnosticSink } from "./diagnostic";
import {
  checkNoOpaqueInType,
  isOpaqueLeafType,
  isValidIdentityFieldType,
  opaqueTypeBanMessage,
} from "./opaque-validation";
import { memberMatchesRefersPattern, refersPatternFieldMissingOnAllMembers } from "./refers";
import {
  checkTypeExpr,
  checkUniqueFields,
  concreteType,
  type OpaqueTable,
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
        message: `Scalar '${scalar.name}' representation must be string, number, integer, or boolean`,
        path,
        span: scalar.span,
      });
    }
    scalars.set(scalar.name, scalar);
  }
  return scalars;
}

export function collectOpaques(program: Program, sink: DiagnosticSink): OpaqueTable {
  const opaques: OpaqueTable = new Map();
  for (const opaque of program.opaques) {
    const path = `opaques.${opaque.name}`;
    if (opaques.has(opaque.name)) {
      sink.push({
        code: "DUPLICATE_OPAQUE",
        message: `Duplicate opaque '${opaque.name}'`,
        path,
        span: opaque.span,
      });
      continue;
    }
    opaques.set(opaque.name, opaque);
  }
  return opaques;
}

export function collectResources(
  program: Program,
  scalars: ScalarTable,
  opaques: OpaqueTable,
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
      const fieldPath = `${path}.identity.${field.name}`;
      checkTypeExpr(field.type, fieldPath, scalars, resources, opaques, sink);
      const concrete = concreteType(field.type, fieldPath, scalars, resources, opaques, sink);
      if (concrete) {
        const hasOpaque = checkNoOpaqueInType(
          concrete,
          fieldPath,
          "OPAQUE_TYPE_NOT_ALLOWED_IN_IDENTITY",
          opaqueTypeBanMessage(concrete, "resource identity"),
          sink,
          field.span
        );
        if (!hasOpaque && !isValidIdentityFieldType(concrete)) {
          sink.push({
            code: "INVALID_IDENTITY_TYPE",
            message: `Identity field type ${formatType(concrete)} must be a primitive or scalar`,
            path: fieldPath,
            span: field.span,
          });
        }
      }
    }

    checkPayloadType(
      resource.payloadType,
      `${path}.payloadType`,
      identity,
      scalars,
      resources,
      opaques,
      sink
    );

    walkCheckRefers(resource.payloadType, `${path}.payloadType`, scalars, resources, opaques, sink);

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
      opaques,
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
  opaques: OpaqueTable,
  sink: DiagnosticSink
): void {
  checkTypeExpr(type, path, scalars, resources, opaques, sink);

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

/** Walk payload object fields (including nested objects/arrays/unions) and validate `refers`. */
function walkCheckRefers(
  type: TypeExpr,
  path: string,
  scalars: ScalarTable,
  resources: ResourceTable,
  opaques: OpaqueTable,
  sink: DiagnosticSink
): void {
  if (type.kind === "object") {
    for (const field of type.fields) {
      const fieldPath = `${path}.${field.name}`;
      checkFieldRefers(field, fieldPath, scalars, resources, opaques, sink);
      walkCheckRefers(field.type, fieldPath, scalars, resources, opaques, sink);
    }
  } else if (type.kind === "array" || type.kind === "nullable") {
    walkCheckRefers(type.of, path, scalars, resources, opaques, sink);
  } else if (type.kind === "union") {
    for (let i = 0; i < type.members.length; i++) {
      walkCheckRefers(type.members[i]!, `${path}|${i}`, scalars, resources, opaques, sink);
    }
  }
}

function checkFieldRefers(
  field: FieldDecl,
  fieldPath: string,
  scalars: ScalarTable,
  resources: ResourceTable,
  opaques: OpaqueTable,
  sink: DiagnosticSink
): void {
  if (!field.refers) return;

  const concrete = concreteType(field.type, fieldPath, scalars, resources, opaques, sink);
  if (concrete && isOpaqueLeafType(concrete)) {
    sink.push({
      code: "OPAQUE_TYPE_NOT_ALLOWED_IN_REFERS",
      message: `Opaque type ${formatType(concrete)} cannot be used with refers`,
      path: fieldPath,
      span: field.span,
    });
  }

  for (let i = 0; i < field.refers.length; i++) {
    const target = field.refers[i]!;
    const targetPath = `${fieldPath}.refers[${i}]`;

    const resourceSymbols = resources.get(target.resource);
    if (!resourceSymbols) {
      sink.push({
        code: "UNKNOWN_REFERS_RESOURCE",
        message: `Unknown resource '${target.resource}' in refers clause`,
        path: targetPath,
        span: target.span,
      });
      continue;
    }

    const members = expandPayloadObjectMembers(resourceSymbols.payloadType, resources);
    if (members === null) {
      sink.push({
        code: "REFERS_MATCHES_NOTHING",
        message: `refers '${target.resource}' pattern matches no payload members`,
        path: targetPath,
        span: target.span,
      });
      continue;
    }

    let hasUnknownField = false;
    for (const pf of target.fields) {
      if (refersPatternFieldMissingOnAllMembers(members, pf.name)) {
        hasUnknownField = true;
        sink.push({
          code: "UNKNOWN_REFERS_FIELD",
          message: `refers pattern field '${pf.name}' is not present on any '${target.resource}' payload member`,
          path: targetPath,
          span: pf.span ?? target.span,
        });
      }
    }
    if (hasUnknownField) continue;

    const matched = members.filter((m) => memberMatchesRefersPattern(m, target.fields));
    if (matched.length === 0) {
      sink.push({
        code: "REFERS_MATCHES_NOTHING",
        message: `refers '${target.resource}' pattern matches no payload members`,
        path: targetPath,
        span: target.span,
      });
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
  opaques: OpaqueTable,
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
        const left = concreteType(field.type, fieldPath, scalars, resources, opaques, sink);
        const right = concreteType(
          identityField.type,
          fieldPath,
          scalars,
          resources,
          opaques,
          sink
        );
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
      const left = concreteType(field.type, fieldPath, scalars, resources, opaques, sink);
      const right = concreteType(identityField.type, fieldPath, scalars, resources, opaques, sink);
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
