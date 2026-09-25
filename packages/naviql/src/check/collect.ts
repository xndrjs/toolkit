import type { Program } from "../ir";
import { formatType, isPrimitiveTypeName, typesSemanticallyEqual } from "./assignability";
import type { DiagnosticSink } from "./diagnostic";
import { checkTypeExpr, checkUniqueFields, type ResourceTable, type ScalarTable } from "./symbols";

export function collectScalars(program: Program, sink: DiagnosticSink): ScalarTable {
  const scalars: ScalarTable = new Map();
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

export function collectResources(
  program: Program,
  scalars: ScalarTable,
  sink: DiagnosticSink
): ResourceTable {
  const resources: ResourceTable = new Map();
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
