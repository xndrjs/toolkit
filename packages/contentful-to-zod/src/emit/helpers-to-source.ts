import type { ContentType } from "../model/content-type";
import { contentTypeIdToPascalCase, deliveryFieldsTypeName, fieldsTypeName } from "./schema-name";

export function flattenEntryFieldsFnName(contentTypeId: string): string {
  return `flatten${contentTypeIdToPascalCase(contentTypeId)}EntryFields`;
}

/** @deprecated Renamed to `flattenEntryFieldsFnName`. */
export const flattenFieldsFnName = flattenEntryFieldsFnName;

/** Emit shared `pickLocale` helper for delivery-shaped localized values. */
export function emitPickLocale(): string {
  return [
    "/** Read one locale from a localized delivery field; missing locale or null input → `null`. */",
    "export function pickLocale<T>(",
    "  value: Record<ContentfulLocaleCode, T> | null,",
    "  locale: ContentfulLocaleCode = CONTENTFUL_DEFAULT_LOCALE,",
    "): T | null {",
    "  if (value === null) {",
    "    return null;",
    "  }",
    "  return value[locale] ?? null;",
    "}",
  ].join("\n");
}

/** Emit `flatten{ContentType}EntryFields` mapping delivery `fields` to flat/CMA fields. */
export function emitFlattenHelper(contentType: ContentType): string {
  const fnName = flattenEntryFieldsFnName(contentType.id);
  const deliveryType = deliveryFieldsTypeName(contentType.id);
  const flatType = fieldsTypeName(contentType.id);

  const entries = contentType.fields.map((field) => {
    const accessor = `fields.${field.id}`;
    if (field.localized) {
      return `    ${JSON.stringify(field.id)}: pickLocale(${accessor} ?? null, _locale),`;
    }
    return `    ${JSON.stringify(field.id)}: ${accessor} ?? null,`;
  });

  return [
    `/** Flatten validated \`${deliveryType}\` (from \`entry.fields\`) to \`${flatType}\` for a single locale. */`,
    `export function ${fnName}(`,
    `  fields: ${deliveryType},`,
    `  _locale: ContentfulLocaleCode = CONTENTFUL_DEFAULT_LOCALE,`,
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
