/** Convert a Contentful content type id (e.g. `blogPost`) to PascalCase (`BlogPost`). */
export function contentTypeIdToPascalCase(id: string): string {
  return id
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
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
