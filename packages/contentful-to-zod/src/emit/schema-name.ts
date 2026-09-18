/** Convert a Contentful content type id (e.g. `blogPost`) to PascalCase (`BlogPost`). */
export function contentTypeIdToPascalCase(id: string): string {
  return id
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/** PascalCase → SCREAMING_SNAKE_CASE (`BlogPostStatus` → `BLOG_POST_STATUS`). */
export function pascalToScreamingSnake(pascal: string): string {
  return pascal
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toUpperCase();
}

function isVowel(char: string): boolean {
  return "aeiou".includes(char.toLowerCase());
}

/**
 * Pluralize a camelCase / lowercase field id for const names.
 * Keeps likely-already-plural ids (`tags`); turns `status` → `statuses`.
 */
export function pluralizeFieldId(fieldId: string): string {
  const lower = fieldId.toLowerCase();
  if (
    lower.endsWith("s") &&
    !lower.endsWith("us") &&
    !lower.endsWith("ss") &&
    !lower.endsWith("is")
  ) {
    return fieldId;
  }

  if (fieldId.length > 1 && fieldId.endsWith("y") && !isVowel(fieldId.charAt(fieldId.length - 2))) {
    return `${fieldId.slice(0, -1)}ies`;
  }

  if (/(?:s|x|z|ch|sh)$/i.test(fieldId)) {
    return `${fieldId}es`;
  }

  return `${fieldId}s`;
}

function fieldEnumPascalName(contentTypeId: string, fieldId: string): string {
  return `${contentTypeIdToPascalCase(contentTypeId)}${contentTypeIdToPascalCase(fieldId)}`;
}

/** Named field enum schema: `blogPost` + `status` → `BlogPostStatusSchema`. */
export function fieldEnumSchemaExportName(contentTypeId: string, fieldId: string): string {
  return `${fieldEnumPascalName(contentTypeId, fieldId)}Schema`;
}

/** Named field enum type: `blogPost` + `status` → `BlogPostStatus`. */
export function fieldEnumTypeName(contentTypeId: string, fieldId: string): string {
  return fieldEnumPascalName(contentTypeId, fieldId);
}

/** Named field enum const: `blogPost` + `status` → `BLOG_POST_STATUSES`. */
export function fieldEnumConstName(contentTypeId: string, fieldId: string): string {
  const contentTypeSnake = pascalToScreamingSnake(contentTypeIdToPascalCase(contentTypeId));
  const fieldSnake = pascalToScreamingSnake(contentTypeIdToPascalCase(pluralizeFieldId(fieldId)));
  return `${contentTypeSnake}_${fieldSnake}`;
}

/** `flat` — single-locale / single-locale fields. */
export function fieldsSchemaExportName(contentTypeId: string): string {
  return `${contentTypeIdToPascalCase(contentTypeId)}FieldsSchema`;
}

export function fieldsTypeName(contentTypeId: string): string {
  return `${contentTypeIdToPascalCase(contentTypeId)}Fields`;
}

/** `localized-only` — maps on `localized: true` fields only. */
export function localizedFieldsSchemaExportName(contentTypeId: string): string {
  return `${contentTypeIdToPascalCase(contentTypeId)}LocalizedFieldsSchema`;
}

export function localizedFieldsTypeName(contentTypeId: string): string {
  return `${contentTypeIdToPascalCase(contentTypeId)}LocalizedFields`;
}

export function localizedEntrySchemaExportName(contentTypeId: string): string {
  return `${contentTypeIdToPascalCase(contentTypeId)}LocalizedEntrySchema`;
}

export function localizedEntryTypeName(contentTypeId: string): string {
  return `${contentTypeIdToPascalCase(contentTypeId)}LocalizedEntry`;
}

/** `all` — every field is a locale map (`locale=*`). */
export function localeStarFieldsSchemaExportName(contentTypeId: string): string {
  return `${contentTypeIdToPascalCase(contentTypeId)}LocaleStarFieldsSchema`;
}

export function localeStarFieldsTypeName(contentTypeId: string): string {
  return `${contentTypeIdToPascalCase(contentTypeId)}LocaleStarFields`;
}

export function localeStarEntrySchemaExportName(contentTypeId: string): string {
  return `${contentTypeIdToPascalCase(contentTypeId)}LocaleStarEntrySchema`;
}

export function localeStarEntryTypeName(contentTypeId: string): string {
  return `${contentTypeIdToPascalCase(contentTypeId)}LocaleStarEntry`;
}

/** Strip the `Schema` suffix from a generated schema export name. */
export function schemaExportNameToTypeName(schemaExportName: string): string {
  if (!schemaExportName.endsWith("Schema")) {
    throw new Error(`Expected schema export name ending with "Schema", got "${schemaExportName}".`);
  }

  return schemaExportName.slice(0, -"Schema".length);
}

/** Emit `export type X = z.infer<typeof XSchema>;` for a generated schema const. */
export function emitInferredType(schemaExportName: string): string {
  const typeName = schemaExportNameToTypeName(schemaExportName);
  return `export type ${typeName} = z.infer<typeof ${schemaExportName}>;`;
}
