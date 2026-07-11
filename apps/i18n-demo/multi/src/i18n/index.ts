import { createI18n } from "./generated/instance.generated";
import { defaultDictionaryFor } from "./generated/dictionary.generated";

export * from "./generated/instance.generated";
export * from "./generated/dictionary.generated";
export * from "./generated/i18n-types.generated";
export * from "./generated/namespace-loaders.generated";

const initialLocale = "en" as const;

export const i18n = createI18n(defaultDictionaryFor(initialLocale));
