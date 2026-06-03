/** Convert a Contentful content type id (e.g. `blogPost`) to PascalCase (`BlogPost`). */
export function contentTypeIdToPascalCase(id: string): string {
  return id
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export function fieldsSchemaExportName(contentTypeId: string): string {
  return `${contentTypeIdToPascalCase(contentTypeId)}FieldsSchema`;
}

export function deliveryFieldsSchemaExportName(contentTypeId: string): string {
  return `${contentTypeIdToPascalCase(contentTypeId)}DeliveryFieldsSchema`;
}

export function fieldsTypeName(contentTypeId: string): string {
  return `${contentTypeIdToPascalCase(contentTypeId)}Fields`;
}

export function deliveryFieldsTypeName(contentTypeId: string): string {
  return `${contentTypeIdToPascalCase(contentTypeId)}DeliveryFields`;
}

export function entrySchemaExportName(contentTypeId: string): string {
  return `${contentTypeIdToPascalCase(contentTypeId)}EntrySchema`;
}

export function entryTypeName(contentTypeId: string): string {
  return `${contentTypeIdToPascalCase(contentTypeId)}Entry`;
}
