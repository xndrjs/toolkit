/** Convert a Contentful content type id (e.g. `blogPost`) to PascalCase (`BlogPost`). */
export function contentTypeIdToPascalCase(id: string): string {
  return id
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export function schemaExportName(contentTypeId: string): string {
  return `${contentTypeIdToPascalCase(contentTypeId)}Schema`;
}

export function deliverySchemaExportName(contentTypeId: string): string {
  return `${contentTypeIdToPascalCase(contentTypeId)}DeliverySchema`;
}

export function fieldsTypeName(contentTypeId: string): string {
  return `${contentTypeIdToPascalCase(contentTypeId)}Fields`;
}

export function deliveryFieldsTypeName(contentTypeId: string): string {
  return `${contentTypeIdToPascalCase(contentTypeId)}DeliveryFields`;
}
