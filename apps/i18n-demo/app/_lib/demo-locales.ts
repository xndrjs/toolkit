import { MyProjectLocales as AREAS_LOCALES } from "../../areas/i18n/generated/i18n-types.generated";
import { MyProjectLocales as MULTI_LOCALES } from "../../multi/i18n/generated/i18n-types.generated";
import { ProgrammaticDemoLocales as PROGRAMMATIC_LOCALES } from "../../programmatic/i18n/generated/i18n-types.generated";
import type { MyProjectLocale as AreasLocale } from "../../areas/i18n/generated/i18n-types.generated";
import type { MyProjectLocale as MultiLocale } from "../../multi/i18n/generated/i18n-types.generated";
import type { ProgrammaticDemoLocale } from "../../programmatic/i18n/generated/i18n-types.generated";

export { AREAS_LOCALES, MULTI_LOCALES, PROGRAMMATIC_LOCALES };

export const MULTI_DEFAULT_LOCALE = "en" as const satisfies MultiLocale;
export const AREAS_DEFAULT_LOCALE = "it" as const satisfies AreasLocale;
export const PROGRAMMATIC_DEFAULT_LOCALE = "en" as const satisfies ProgrammaticDemoLocale;
