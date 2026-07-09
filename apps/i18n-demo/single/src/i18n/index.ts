import { createI18n } from "./generated/instance.generated";
import { defaultDictionary } from "./generated/dictionary.generated";

export * from "./generated/instance.generated";
export * from "./generated/dictionary.generated";
export * from "./generated/i18n-types.generated";

export const i18n = createI18n(defaultDictionary);
