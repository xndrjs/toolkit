import type { ContentfulToZodConfig } from "../config/define-config";
import type { ContentField, ContentFieldValidation, ContentType } from "../model/content-type";
import { fieldsForCodegen } from "./filter-fields";
import { fieldEnumConstName, fieldEnumSchemaExportName, fieldEnumTypeName } from "./schema-name";

export interface FieldEnumDescriptor {
  contentTypeId: string;
  fieldId: string;
  values: (string | number)[];
  /** Whether `validations.in` lived on the field or on `items`. */
  source: "field" | "items";
}

function validationInValues(
  validations: ContentFieldValidation[] | undefined
): (string | number)[] | undefined {
  for (const validation of validations ?? []) {
    if (validation.in !== undefined && validation.in.length > 0) {
      return validation.in;
    }
  }
  return undefined;
}

function fieldEnumKey(contentTypeId: string, fieldId: string): string {
  return `${contentTypeId}.${fieldId}`;
}

/** Collect `validations.in` enums from selected content types (field or array items). */
export function collectFieldEnums(
  contentTypes: readonly ContentType[],
  config?: ContentfulToZodConfig | undefined
): FieldEnumDescriptor[] {
  const enums: FieldEnumDescriptor[] = [];

  for (const contentType of contentTypes) {
    for (const field of fieldsForCodegen(contentType.fields, config)) {
      const fieldIn = validationInValues(field.validations);
      if (fieldIn && field.type !== "Array") {
        enums.push({
          contentTypeId: contentType.id,
          fieldId: field.id,
          values: fieldIn,
          source: "field",
        });
        continue;
      }

      if (field.type === "Array") {
        const itemsIn = validationInValues(field.items?.validations);
        if (itemsIn) {
          enums.push({
            contentTypeId: contentType.id,
            fieldId: field.id,
            values: itemsIn,
            source: "items",
          });
        }
      }
    }
  }

  return enums;
}

/** Lookup map keyed by `contentTypeId.fieldId`. */
export function fieldEnumDescriptorMap(
  enums: readonly FieldEnumDescriptor[]
): ReadonlyMap<string, FieldEnumDescriptor> {
  return new Map(enums.map((entry) => [fieldEnumKey(entry.contentTypeId, entry.fieldId), entry]));
}

export function lookupFieldEnum(
  map: ReadonlyMap<string, FieldEnumDescriptor> | undefined,
  contentTypeId: string,
  fieldId: string
): FieldEnumDescriptor | undefined {
  return map?.get(fieldEnumKey(contentTypeId, fieldId));
}

function areAllStrings(values: readonly (string | number)[]): values is readonly string[] {
  return values.every((value) => typeof value === "string");
}

function serializeConstArray(values: readonly (string | number)[]): string {
  return `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
}

function emitNamedEnumSchema(
  schemaName: string,
  constName: string,
  values: readonly (string | number)[]
): string {
  if (areAllStrings(values)) {
    return `export const ${schemaName} = z.enum(${constName});`;
  }

  if (values.length === 1) {
    return `export const ${schemaName} = z.literal(${JSON.stringify(values[0])});`;
  }

  const literals = values.map((value) => `z.literal(${JSON.stringify(value)})`).join(", ");
  return `export const ${schemaName} = z.union([${literals}]);`;
}

/** Emit values-first named enum blocks for fields with `validations.in`. */
export function emitFieldEnumPrimitives(enums: readonly FieldEnumDescriptor[]): string {
  if (enums.length === 0) {
    return "";
  }

  const blocks = enums.map((entry) => {
    const constName = fieldEnumConstName(entry.contentTypeId, entry.fieldId);
    const typeName = fieldEnumTypeName(entry.contentTypeId, entry.fieldId);
    const schemaName = fieldEnumSchemaExportName(entry.contentTypeId, entry.fieldId);

    return [
      "/** @generated from field validations.in */",
      `export const ${constName} = ${serializeConstArray(entry.values)} as const;`,
      `export type ${typeName} = (typeof ${constName})[number];`,
      emitNamedEnumSchema(schemaName, constName, entry.values),
    ].join("\n");
  });

  return blocks.join("\n\n");
}

/** Build the Zod source fragment that references a named field enum (array-aware). */
export function fieldEnumValueSource(field: ContentField, descriptor: FieldEnumDescriptor): string {
  const schemaName = fieldEnumSchemaExportName(descriptor.contentTypeId, descriptor.fieldId);

  if (descriptor.source === "items") {
    let source = `z.array(${schemaName})`;
    for (const validation of field.validations ?? []) {
      if (validation.size?.min !== undefined) {
        source += `.min(${JSON.stringify(validation.size.min)})`;
      }
      if (validation.size?.max !== undefined) {
        source += `.max(${JSON.stringify(validation.size.max)})`;
      }
    }
    return source;
  }

  return schemaName;
}
