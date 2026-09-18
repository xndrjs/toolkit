import type { ContentType } from "../model/content-type";
import type { ContentfulToZodConfig } from "../config/define-config";
import type { ResolvedFieldLocalizationFlags } from "../config/define-config";
import { fieldsForCodegen } from "./filter-fields";
import { contentTypeIdToPascalCase, fieldsTypeName, localizedFieldsTypeName } from "./schema-name";

export function flattenLocalizedFieldsFnName(contentTypeId: string): string {
  return `flatten${contentTypeIdToPascalCase(contentTypeId)}LocalizedFields`;
}

/** Emit shared `pickLocale` helper for localized field maps. */
export function emitPickLocale(): string {
  return [
    "/** Read one locale from a localized field map; missing locale or null input → `null`. */",
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

/** Emit `flatten{ContentType}LocalizedFields` mapping localized-only `fields` to flat fields. */
export function emitFlattenHelper(
  contentType: ContentType,
  config?: ContentfulToZodConfig | undefined
): string {
  const fnName = flattenLocalizedFieldsFnName(contentType.id);
  const localizedType = localizedFieldsTypeName(contentType.id);
  const flatType = fieldsTypeName(contentType.id);

  const entries = fieldsForCodegen(contentType.fields, config).map((field) => {
    const accessor = `fields.${field.id}`;
    if (field.localized) {
      return `    ${JSON.stringify(field.id)}: pickLocale(${accessor} ?? null, _locale),`;
    }
    return `    ${JSON.stringify(field.id)}: ${accessor} ?? null,`;
  });

  return [
    `/** Flatten validated \`${localizedType}\` (from \`entry.fields\`) to \`${flatType}\` for a single locale. */`,
    `export function ${fnName}(`,
    `  fields: ${localizedType},`,
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
  flags: Pick<ResolvedFieldLocalizationFlags, "includePickLocale" | "includeFlatten">,
  config?: ContentfulToZodConfig | undefined
): string {
  if (!flags.includePickLocale) {
    return "";
  }

  const sections: string[] = [emitPickLocale()];

  if (flags.includeFlatten) {
    for (const contentType of contentTypes) {
      sections.push("", emitFlattenHelper(contentType, config));
    }
  }

  return sections.join("\n");
}
