import type { ContentType } from "../model/content-type";
import { contentTypeIdToPascalCase, deliveryFieldsTypeName, fieldsTypeName } from "./schema-name";

export function flattenFieldsFnName(contentTypeId: string): string {
  return `flatten${contentTypeIdToPascalCase(contentTypeId)}Fields`;
}

/** Emit shared `pickLocale` helper for delivery-shaped localized values. */
export function emitPickLocale(): string {
  return [
    "/** Unwrap a localized delivery value; falls back to `CONTENTFUL_DEFAULT_LOCALE`. */",
    "export function pickLocale<T>(",
    "  value: Partial<Record<ContentfulLocaleCode, T>> | T | undefined,",
    "  locale: ContentfulLocaleCode = CONTENTFUL_DEFAULT_LOCALE,",
    "): T | undefined {",
    "  if (value === undefined) {",
    "    return undefined;",
    "  }",
    "  if (",
    "    value !== null &&",
    '    typeof value === "object" &&',
    "    !Array.isArray(value) &&",
    "    Object.keys(value).some((key) =>",
    "      (CONTENTFUL_LOCALE_CODES as readonly string[]).includes(key),",
    "    )",
    "  ) {",
    "    return (value as Partial<Record<ContentfulLocaleCode, T>>)[locale];",
    "  }",
    "  return value as T;",
    "}",
  ].join("\n");
}

/** Emit `flatten{ContentType}Fields` mapping delivery shape to flat/CMA fields. */
export function emitFlattenHelper(contentType: ContentType): string {
  const fnName = flattenFieldsFnName(contentType.id);
  const deliveryType = deliveryFieldsTypeName(contentType.id);
  const flatType = fieldsTypeName(contentType.id);

  const entries = contentType.fields.map((field) => {
    const accessor = `fields.${field.id}`;
    if (field.localized) {
      return `    ${JSON.stringify(field.id)}: pickLocale(${accessor}, locale),`;
    }
    return `    ${JSON.stringify(field.id)}: ${accessor},`;
  });

  return [
    `/** Flatten \`${deliveryType}\` to \`${flatType}\` for a single locale. */`,
    `export function ${fnName}(`,
    `  fields: ${deliveryType},`,
    `  locale: ContentfulLocaleCode = CONTENTFUL_DEFAULT_LOCALE,`,
    `): ${flatType} {`,
    "  return {",
    ...entries,
    "  };",
    "}",
  ].join("\n");
}

export function emitLocaleHelpers(
  contentTypes: ContentType[],
  localeMode: "cma" | "delivery" | "both"
): string {
  const includePickLocale = localeMode === "delivery" || localeMode === "both";
  const includeFlatten = localeMode === "both";

  if (!includePickLocale) {
    return "";
  }

  const sections: string[] = [emitPickLocale()];

  if (includeFlatten) {
    for (const contentType of contentTypes) {
      sections.push("", emitFlattenHelper(contentType));
    }
  }

  return sections.join("\n");
}
