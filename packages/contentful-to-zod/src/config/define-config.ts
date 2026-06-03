import type { z } from "zod";

export type LocaleMode = "cma" | "delivery" | "both";

/** Override map for Contentful `Object` fields keyed as `{contentTypeId}.{fieldId}`. */
export interface ContentfulToZodConfig {
  cma?: {
    spaceId?: string;
    environment?: string;
    managementToken?: string;
  };
  out?: string;
  snapshot?: string;
  snapshotLocales?: string;
  fromSnapshot?: boolean;
  contentTypeIds?: string[];
  locale?: {
    /** Default: `"both"`. */
    mode?: LocaleMode;
  };
  /** Control which CMA blueprint fields are emitted (default: active fields only). */
  fields?: {
    /** Include fields marked `omitted: true` in the content model. Default: `false`. */
    includeOmitted?: boolean;
    /** Include fields marked `disabled: true` in the content model. Default: `false`. */
    includeDisabled?: boolean;
    /** Include fields marked `deleted: true` in the content model. Default: `false`. */
    includeDeleted?: boolean;
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
