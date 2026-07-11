// Automatically generated code. Do not edit manually.
import {
  IcuTranslationProviderSingle,
  projectNamespaceLocalesCore,
  type OnMissingTranslation,
} from "@xndrjs/i18n";
import type { ProgrammaticDemoParams, ProgrammaticDemoSchema } from "./i18n-types.generated";
import { LOCALE_FALLBACK, type ProgrammaticDemoLocale } from "./i18n-types.generated";

export function createI18n(
  dictionary: ProgrammaticDemoSchema,
  options?: { onMissing?: OnMissingTranslation }
) {
  return new IcuTranslationProviderSingle<
    ProgrammaticDemoSchema,
    ProgrammaticDemoParams,
    ProgrammaticDemoLocale,
    typeof LOCALE_FALLBACK
  >(dictionary, {
    localeFallback: LOCALE_FALLBACK,
    ...options,
  });
}

export function projectDictionaryLocales(
  dictionary: ProgrammaticDemoSchema,
  locales: readonly ProgrammaticDemoLocale[]
): ProgrammaticDemoSchema {
  return projectNamespaceLocalesCore(dictionary, locales, LOCALE_FALLBACK);
}
