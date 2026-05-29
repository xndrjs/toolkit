import type { z } from "zod";

export type LocaleMode = "cma" | "delivery" | "both";

/** Override map for Contentful `Object` fields keyed as `{contentTypeId}.{fieldId}`. */
export interface ContentfulToZodConfig {
  locale?: {
    /** Default: `"both"`. */
    mode?: LocaleMode;
  };
  objects?: Record<string, z.ZodType>;
}

export function defineConfig(config: ContentfulToZodConfig): ContentfulToZodConfig {
  return {
    ...config,
    locale: {
      ...config.locale,
      mode: config.locale?.mode ?? "both",
    },
  };
}

/** Resolve locale mode from codegen options and optional config defaults. */
export function resolveLocaleMode(options: {
  localeMode?: LocaleMode | undefined;
  config?: ContentfulToZodConfig | undefined;
}): LocaleMode {
  return options.localeMode ?? options.config?.locale?.mode ?? "both";
}
