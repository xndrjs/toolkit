import { z } from "zod";

import type { Locale } from "../model/locale";
import { zodToSource } from "./zod-to-source";

export function buildLocaleCodeSchema(
  locales: Locale[]
): z.ZodEnum<Readonly<Record<string, string>>> {
  const codes = locales.map((locale) => locale.code);
  if (codes.length === 0) {
    throw new Error("At least one locale is required to build ContentfulLocaleCodeSchema.");
  }

  const [first, ...rest] = codes as [string, ...string[]];
  return z.enum([first, ...rest]);
}

export function resolveDefaultLocale(locales: Locale[]): string {
  const defaultLocale = locales.find((locale) => locale.default);
  if (!defaultLocale) {
    throw new Error("No default locale found in locale snapshot.");
  }
  return defaultLocale.code;
}

/** Emit locale primitive exports for the top of a generated file. */
export function emitLocalePrimitives(locales: Locale[]): string {
  const localeCodeSchema = buildLocaleCodeSchema(locales);
  const defaultLocale = resolveDefaultLocale(locales);
  const schemaSource = zodToSource(localeCodeSchema);

  return [
    "/** @generated from space locales snapshot */",
    `export const ContentfulLocaleCodeSchema = ${schemaSource};`,
    "export type ContentfulLocaleCode = z.infer<typeof ContentfulLocaleCodeSchema>;",
    "",
    "export const CONTENTFUL_LOCALE_CODES = ContentfulLocaleCodeSchema.options;",
    `export const CONTENTFUL_DEFAULT_LOCALE = ${JSON.stringify(defaultLocale)} as const;`,
  ].join("\n");
}

export function requireLocalesForMode(
  localeMode: "cma" | "delivery" | "both",
  locales: Locale[] | undefined
): Locale[] | undefined {
  if (localeMode === "cma") {
    return locales;
  }

  if (!locales?.length) {
    throw new Error(
      `Locales are required when locale mode is "${localeMode}". Provide locales in generateZodSchemas options.`
    );
  }

  return locales;
}
