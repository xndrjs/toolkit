import type { z } from "zod";

/**
 * How field values are localized in generated Zod shapes:
 * - `flat` — every field is a single value (CDA/CPA `locale=<code>`, or after flatten)
 * - `localized-only` — only `localized: true` fields are `Record<locale, T>` (CMA entry fields)
 * - `all` — every field is `Record<locale, T>` (CDA/CPA `locale=*`)
 */
export type FieldLocalizationMode = "flat" | "localized-only" | "all";

export const DEFAULT_FIELD_LOCALIZATION_MODES: readonly FieldLocalizationMode[] = [
  "flat",
  "localized-only",
] as const;

/** Locale / field-localization codegen settings (multi-mode in one output file). */
export interface LocaleConfig {
  /**
   * Which field-localization shapes to emit.
   * Default: `["flat", "localized-only"]`.
   */
  modes?: FieldLocalizationMode[];
}

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
  /** Default modes: `["flat", "localized-only"]`. */
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

const EMPTY_MODES_ERROR =
  'locale.modes must include at least one of "flat", "localized-only", or "all".';

const UNKNOWN_MODE_ERROR = (mode: string) =>
  `Unknown field localization mode "${mode}". Expected "flat", "localized-only", or "all".`;

const VALID_MODES = new Set<FieldLocalizationMode>(["flat", "localized-only", "all"]);

/** Normalize and validate a modes list (dedupe, preserve order). */
export function normalizeFieldLocalizationModes(
  modes: readonly FieldLocalizationMode[] | undefined
): FieldLocalizationMode[] {
  if (!modes?.length) {
    return [...DEFAULT_FIELD_LOCALIZATION_MODES];
  }

  const seen = new Set<FieldLocalizationMode>();
  const result: FieldLocalizationMode[] = [];

  for (const mode of modes) {
    if (!VALID_MODES.has(mode)) {
      throw new Error(UNKNOWN_MODE_ERROR(String(mode)));
    }
    if (!seen.has(mode)) {
      seen.add(mode);
      result.push(mode);
    }
  }

  if (result.length === 0) {
    throw new Error(EMPTY_MODES_ERROR);
  }

  return result;
}

export function defineConfig(config: ContentfulToZodConfig): ContentfulToZodConfig {
  return {
    ...config,
    locale: {
      modes: normalizeFieldLocalizationModes(config.locale?.modes),
    },
  };
}

/** Resolved field-localization modes from options and/or config. */
export function resolveFieldLocalizationModes(options: {
  localeModes?: readonly FieldLocalizationMode[] | undefined;
  config?: ContentfulToZodConfig | undefined;
}): FieldLocalizationMode[] {
  if (options.localeModes !== undefined) {
    return normalizeFieldLocalizationModes(options.localeModes);
  }
  return normalizeFieldLocalizationModes(options.config?.locale?.modes);
}

export interface ResolvedFieldLocalizationFlags {
  modes: FieldLocalizationMode[];
  includeFlat: boolean;
  includeLocalizedOnly: boolean;
  includeAll: boolean;
  /** Locales snapshot / enum required. */
  needsLocales: boolean;
  /** Emit `pickLocale`. */
  includePickLocale: boolean;
  /** Emit flatten helpers (`localized-only` → `flat`). */
  includeFlatten: boolean;
  /** Emit flatten helpers (`all` / locale=* → `flat`). */
  includeFlattenLocaleStar: boolean;
}

export function resolveFieldLocalizationFlags(options: {
  localeModes?: readonly FieldLocalizationMode[] | undefined;
  config?: ContentfulToZodConfig | undefined;
}): ResolvedFieldLocalizationFlags {
  const modes = resolveFieldLocalizationModes(options);
  const includeFlat = modes.includes("flat");
  const includeLocalizedOnly = modes.includes("localized-only");
  const includeAll = modes.includes("all");
  const needsLocales = includeLocalizedOnly || includeAll;

  return {
    modes,
    includeFlat,
    includeLocalizedOnly,
    includeAll,
    needsLocales,
    includePickLocale: needsLocales,
    includeFlatten: includeFlat && includeLocalizedOnly,
    includeFlattenLocaleStar: includeFlat && includeAll,
  };
}
