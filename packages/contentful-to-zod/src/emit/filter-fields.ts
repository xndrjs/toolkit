import type { ContentfulToZodConfig } from "../config/define-config";
import type { ContentField } from "../model/content-type";

/** Whether a CMA field should appear in generated schemas and flatten helpers. */
export function isFieldIncludedInOutput(
  field: ContentField,
  config?: ContentfulToZodConfig | undefined
): boolean {
  if (field.deleted && !config?.fields?.includeDeleted) {
    return false;
  }
  if (field.omitted && !config?.fields?.includeOmitted) {
    return false;
  }
  if (field.disabled && !config?.fields?.includeDisabled) {
    return false;
  }
  return true;
}

/** Content-type fields included in codegen output (default: active fields only). */
export function fieldsForCodegen(
  fields: ContentField[],
  config?: ContentfulToZodConfig | undefined
): ContentField[] {
  return fields.filter((field) => isFieldIncludedInOutput(field, config));
}
