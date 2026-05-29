import { z } from "zod";

import type { ContentfulToZodConfig } from "../config/define-config";
import type { ContentField, ContentFieldItem, ContentFieldValidation } from "../model/content-type";
import {
  ContentfulAssetLinkSchema,
  ContentfulEntryLinkSchema,
  ContentfulLocationSchema,
} from "./primitives";
import { wrapAbsentToNullField } from "./transport-primitives";
import { zodToSource } from "./zod-to-source";

type MappableFieldItem = ContentFieldItem & { items?: ContentFieldItem };

export interface FieldToZodContext {
  contentTypeId: string;
  config?: ContentfulToZodConfig | undefined;
}

export interface FieldZodResult {
  schema: z.ZodType;
  /** Extra source appended after `zodToSource(schema)` (e.g. prohibitRegexp refine). */
  sourceSuffix?: string | undefined;
}

function objectOverrideKey(contentTypeId: string, fieldId: string): string {
  return `${contentTypeId}.${fieldId}`;
}

function validationValues(
  validations: ContentFieldValidation[] | undefined
): (string | number)[] | undefined {
  for (const validation of validations ?? []) {
    if (validation.in !== undefined) {
      return validation.in;
    }
  }
  return undefined;
}

function applyInValidation(base: z.ZodType, values: (string | number)[]): z.ZodType {
  if (values.every((value) => typeof value === "string")) {
    const [first, ...rest] = values as string[];
    if (first === undefined) {
      return base;
    }
    return z.enum([first, ...rest]);
  }

  return z.union(
    values.map((value) => z.literal(value)) as [z.ZodLiteral, z.ZodLiteral, ...z.ZodLiteral[]]
  );
}

function applyStringValidations(
  schema: z.ZodString,
  validations: ContentFieldValidation[]
): z.ZodString {
  let result = schema;

  for (const validation of validations) {
    if (validation.size?.min !== undefined) {
      result = result.min(validation.size.min);
    }
    if (validation.size?.max !== undefined) {
      result = result.max(validation.size.max);
    }
    if (validation.regexp) {
      result = result.regex(new RegExp(validation.regexp.pattern, validation.regexp.flags ?? ""));
    }
  }

  return result;
}

function applyNumberValidations(
  schema: z.ZodNumber,
  validations: ContentFieldValidation[]
): z.ZodNumber {
  let result = schema;

  for (const validation of validations) {
    if (validation.range?.min !== undefined) {
      result = result.min(validation.range.min);
    }
    if (validation.range?.max !== undefined) {
      result = result.max(validation.range.max);
    }
  }

  return result;
}

function applyArrayValidations(
  schema: z.ZodArray<z.ZodType>,
  validations: ContentFieldValidation[]
): z.ZodArray<z.ZodType> {
  let result = schema;

  for (const validation of validations) {
    if (validation.size?.min !== undefined) {
      result = result.min(validation.size.min);
    }
    if (validation.size?.max !== undefined) {
      result = result.max(validation.size.max);
    }
  }

  return result;
}

function applyDateValidations(
  schema: z.ZodISODateTime,
  validations: ContentFieldValidation[]
): z.ZodISODateTime {
  let result = schema;
  const withIsoBounds = result as z.ZodISODateTime & {
    min: (value: string) => z.ZodISODateTime;
    max: (value: string) => z.ZodISODateTime;
  };

  for (const validation of validations) {
    if (validation.dateRange?.min !== undefined) {
      result = withIsoBounds.min(validation.dateRange.min);
    }
    if (validation.dateRange?.max !== undefined) {
      result = withIsoBounds.max(validation.dateRange.max);
    }
  }

  return result;
}

function prohibitRegexpSuffix(validations: ContentFieldValidation[]): string | undefined {
  for (const validation of validations) {
    if (!validation.prohibitRegexp) {
      continue;
    }

    const flags = validation.prohibitRegexp.flags
      ? `, ${JSON.stringify(validation.prohibitRegexp.flags)}`
      : "";
    return `.refine((value) => !new RegExp(${JSON.stringify(validation.prohibitRegexp.pattern)}${flags}).test(value))`;
  }

  return undefined;
}

function mapFieldItemToZod(item: MappableFieldItem): z.ZodType {
  const validations = item.validations ?? [];
  const inValues = validationValues(validations);

  switch (item.type) {
    case "Symbol":
    case "Text": {
      const base = inValues ? applyInValidation(z.string(), inValues) : z.string();
      if (base instanceof z.ZodString) {
        return applyStringValidations(base, validations);
      }
      return base;
    }
    case "Integer": {
      const base = inValues ? applyInValidation(z.number().int(), inValues) : z.number().int();
      if (base instanceof z.ZodNumber) {
        return applyNumberValidations(base, validations);
      }
      return base;
    }
    case "Number": {
      const base = inValues ? applyInValidation(z.number(), inValues) : z.number();
      if (base instanceof z.ZodNumber) {
        return applyNumberValidations(base, validations);
      }
      return base;
    }
    case "Boolean":
      return z.boolean();
    case "Date": {
      const base = z.iso.datetime();
      return applyDateValidations(base, validations);
    }
    case "Location":
      return ContentfulLocationSchema;
    case "Object":
      return z.record(z.string(), z.unknown());
    case "Link":
      if (item.linkType === "Asset") {
        return ContentfulAssetLinkSchema;
      }
      return ContentfulEntryLinkSchema;
    case "Array": {
      if (!item.items) {
        return z.array(z.unknown());
      }
      const itemSchema = mapFieldItemToZod(item.items);
      return applyArrayValidations(z.array(itemSchema), validations);
    }
    case "RichText":
      return z.looseObject({ nodeType: z.literal("document") });
    case "ResourceLink":
      return z.looseObject({
        sys: z.object({
          type: z.literal("ResourceLink"),
          linkType: z.string(),
          urn: z.string(),
        }),
      });
    default:
      return z.unknown();
  }
}

function resolveObjectFieldSchema(
  field: ContentField,
  ctx: FieldToZodContext
): z.ZodType | undefined {
  const override = ctx.config?.objects?.[objectOverrideKey(ctx.contentTypeId, field.id)];
  return override;
}

/** Map a Contentful field to its flat/CMA base Zod schema (`T`). */
export function fieldToZod(field: ContentField, ctx: FieldToZodContext): FieldZodResult {
  const validations = field.validations ?? [];
  let schema: z.ZodType;

  if (field.type === "Object") {
    const override = resolveObjectFieldSchema(field, ctx);
    schema = override ?? z.record(z.string(), z.unknown());
  } else {
    schema = mapFieldItemToZod(field);
  }

  const sourceSuffix =
    field.type === "Symbol" || field.type === "Text"
      ? prohibitRegexpSuffix(validations)
      : undefined;

  if (!field.required) {
    schema = schema.optional();
  }

  return sourceSuffix ? { schema, sourceSuffix } : { schema };
}

function unwrapOptionalSchema(schema: z.ZodType): { inner: z.ZodType; wasOptional: boolean } {
  const internal = schema as z.ZodType & {
    _zod?: { def: { type?: string; innerType?: z.ZodType } };
  };
  const def = internal._zod?.def;
  if (def?.type === "optional" && def.innerType) {
    return { inner: def.innerType, wasOptional: true };
  }
  return { inner: schema, wasOptional: false };
}

function emitFlatFieldSource(baseSource: string): string {
  return `flatField(${baseSource})`;
}

/** Emit Zod source for a flat/CMA field (`flatField` normalizes absent values to `null`). */
export function flatFieldSource(flat: FieldZodResult, _field: ContentField): string {
  const { inner } = unwrapOptionalSchema(flat.schema);
  const innerSource = zodToSource(inner, flat.sourceSuffix ?? "");
  return emitFlatFieldSource(innerSource);
}

/** Wrap a flat field schema for delivery API shape (locale record + transport nullability). */
export function wrapForDelivery(
  result: FieldZodResult,
  field: ContentField,
  localeCodeSchema: z.ZodEnum<Readonly<Record<string, string>>>
): FieldZodResult {
  const { inner } = unwrapOptionalSchema(result.schema);

  const base = field.localized ? z.record(localeCodeSchema as z.ZodType<string>, inner) : inner;

  return {
    schema: wrapAbsentToNullField(base),
    sourceSuffix: result.sourceSuffix,
  };
}

/** Emit Zod source for a delivery API field (transport wrapper; localized → locale record). */
export function deliveryFieldSource(flat: FieldZodResult, field: ContentField): string {
  const { inner } = unwrapOptionalSchema(flat.schema);
  const innerSource = zodToSource(inner, flat.sourceSuffix ?? "");

  const baseSource = field.localized
    ? `z.record(ContentfulLocaleCodeSchema, ${innerSource})`
    : innerSource;

  return `transportField(${baseSource})`;
}

/** Validate config object overrides against content types (fail-fast). */
export function validateObjectOverrides(
  contentTypes: { id: string; fields: ContentField[] }[],
  config?: ContentfulToZodConfig | undefined
): void {
  if (!config?.objects) {
    return;
  }

  const fieldsByKey = new Map<string, ContentField>();
  for (const contentType of contentTypes) {
    for (const field of contentType.fields) {
      fieldsByKey.set(objectOverrideKey(contentType.id, field.id), field);
    }
  }

  for (const key of Object.keys(config.objects)) {
    const field = fieldsByKey.get(key);
    if (!field) {
      throw new Error(`Object override "${key}" does not match any content type field.`);
    }
    if (field.type !== "Object") {
      throw new Error(
        `Object override "${key}" targets field "${field.id}" which is type "${field.type}", not "Object".`
      );
    }
  }
}
