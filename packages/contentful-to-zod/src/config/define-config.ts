import type { z } from "zod";

export type LocaleMode = "cma" | "delivery" | "both";

/**
 * Locale codegen settings.
 * `localeStar` is only valid with `"delivery"` or `"both"` (default `false`).
 */
export type LocaleConfig =
  | { mode: "cma" }
  | { mode: "delivery"; localeStar?: boolean }
  | { mode: "both"; localeStar?: boolean };

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
  /** Default mode: `"both"`. */
  locale?: LocaleConfig;
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

const LOCALE_STAR_CMA_ERROR =
  'locale.localeStar cannot be enabled when locale.mode is "cma". Use mode "delivery" or "both".';

/** Runtime check for untyped configs that set `localeStar` with CMA mode. */
export function assertLocaleStarAllowed(mode: LocaleMode, localeStar: boolean | undefined): void {
  if (mode === "cma" && localeStar === true) {
    throw new Error(LOCALE_STAR_CMA_ERROR);
  }
}

function localeStarFromConfig(config: ContentfulToZodConfig | undefined): boolean | undefined {
  const locale = config?.locale as { localeStar?: boolean } | undefined;
  return locale?.localeStar;
}

export function defineConfig(config: ContentfulToZodConfig): ContentfulToZodConfig {
  const mode = config.locale?.mode ?? "both";
  const localeStar = localeStarFromConfig(config);
  assertLocaleStarAllowed(mode, localeStar);

  if (mode === "cma") {
    return {
      ...config,
      locale: { mode: "cma" },
    };
  }

  return {
    ...config,
    locale: {
      mode,
      localeStar: localeStar ?? false,
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

/**
 * Resolve whether to emit `locale=*` (localeStar) schemas.
 * Explicit `localeStar` option wins over config; default `false`.
 * Throws when enabled under CMA mode.
 */
export function resolveLocaleStar(options: {
  localeStar?: boolean | undefined;
  localeMode?: LocaleMode | undefined;
  config?: ContentfulToZodConfig | undefined;
}): boolean {
  const mode = resolveLocaleMode({
    localeMode: options.localeMode,
    config: options.config,
  });
  const localeStar = options.localeStar ?? localeStarFromConfig(options.config) ?? false;
  assertLocaleStarAllowed(mode, localeStar);
  return mode === "cma" ? false : localeStar;
}
