import { z } from "zod";

import type { Locale } from "../model/locale";

function serializeConstStringArray(values: readonly string[]): string {
  return `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
}

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
  const codes = locales.map((locale) => locale.code);
  if (codes.length === 0) {
    throw new Error("At least one locale is required to build ContentfulLocaleCodeSchema.");
  }

  const defaultLocale = resolveDefaultLocale(locales);

  return [
    "/** @generated from space locales snapshot */",
    `export const CONTENTFUL_LOCALE_CODES = ${serializeConstStringArray(codes)} as const;`,
    "export type ContentfulLocaleCode = (typeof CONTENTFUL_LOCALE_CODES)[number];",
    "export const ContentfulLocaleCodeSchema = z.enum(CONTENTFUL_LOCALE_CODES);",
    `export const CONTENTFUL_DEFAULT_LOCALE = ${JSON.stringify(defaultLocale)} as const;`,
  ].join("\n");
}

export function requireLocalesForModes(
  needsLocales: boolean,
  locales: Locale[] | undefined
): Locale[] | undefined {
  if (!needsLocales) {
    return locales;
  }

  if (!locales?.length) {
    throw new Error(
      'Locales are required when locale.modes includes "localized-only" or "all". Provide locales in generateZodSchemas options.'
    );
  }

  return locales;
}
