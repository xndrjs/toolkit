import type { BuilderResourceEntry } from "./builder-load-registry.js";

/**
 * Portable i18n instance state after `serialize()`: dictionary strings + which
 * builder resources are already loaded (namespace × partition).
 */
export interface I18nSerializedState<Dictionary = Record<string, unknown>> {
  dictionary: Dictionary;
  resources: readonly BuilderResourceEntry[];
}

/**
 * Input nested under generated `createI18n({ state? })`. Omitted `state` defaults to an empty
 * dictionary (lazy cold start). `resources` may be omitted or `[]`.
 */
export type I18nCreateInput<Dictionary = Record<string, unknown>> = {
  dictionary: Dictionary;
  resources?: readonly BuilderResourceEntry[];
};

export function normalizeI18nCreateInput<Dictionary>(
  value?: I18nCreateInput<Dictionary>
): I18nSerializedState<Dictionary> {
  return {
    dictionary: value?.dictionary ?? ({} as Dictionary),
    resources: value?.resources ?? [],
  };
}
