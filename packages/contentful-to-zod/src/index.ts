export {
  defineConfig,
  normalizeFieldLocalizationModes,
  resolveFieldLocalizationFlags,
  resolveFieldLocalizationModes,
  DEFAULT_FIELD_LOCALIZATION_MODES,
  type ContentfulToZodConfig,
  type FieldLocalizationMode,
  type LocaleConfig,
  type ResolvedFieldLocalizationFlags,
} from "./config/define-config";

export { DEFAULT_ENVIRONMENT_ID } from "./client/cma-params";
export type {
  FetchCmaOptions,
  FetchContentTypesOptions,
  FetchLocalesOptions,
} from "./client/cma-params";
export { fetchContentTypes } from "./client/fetch-content-types";
export { fetchLocales } from "./client/fetch-locales";
export { mapContentTypeFromCma, mapLocaleFromCma } from "./client/map-from-cma";

export type {
  ContentField,
  ContentFieldItem,
  ContentFieldValidation,
  ContentfulFieldType,
  ContentfulLinkType,
  ContentType,
  DateRange,
  NumRange,
  RegExpValidation,
} from "./model/content-type";
export type { Locale } from "./model/locale";

export { generateZodSchemas, type GenerateZodSchemasOptions } from "./emit/generate-file";
export {
  collectLinkFields,
  collectLinkFieldTargets,
  linkContentTypeFromValidations,
  validateLinkFieldTargets,
  type LinkFieldDescriptor,
  type LinkFieldTarget,
} from "./emit/link-fields";
export {
  fieldToZod,
  wrapForLocalized,
  localizedFieldSource,
  validateObjectOverrides,
} from "./emit/field-to-zod";
export {
  buildLocaleCodeSchema,
  emitLocalePrimitives,
  requireLocalesForModes,
  resolveDefaultLocale,
} from "./emit/locale-primitives";
export {
  emitContentTypeLocalizedEntrySchema,
  emitEntrySysPrimitives,
} from "./emit/entry-to-source";
export {
  emitFlattenHelper,
  emitLocaleHelpers,
  emitPickLocale,
  flattenLocalizedFieldsFnName,
} from "./emit/helpers-to-source";
export { zodToSource } from "./emit/zod-to-source";
