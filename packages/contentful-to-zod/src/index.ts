export {
  defineConfig,
  resolveLocaleMode,
  type ContentfulToZodConfig,
  type LocaleMode,
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
export { fieldToZod, wrapForDelivery, validateObjectOverrides } from "./emit/field-to-zod";
export {
  buildLocaleCodeSchema,
  emitLocalePrimitives,
  requireLocalesForMode,
  resolveDefaultLocale,
} from "./emit/locale-primitives";
export { emitContentTypeEntrySchema, emitEntrySysPrimitives } from "./emit/entry-to-source";
export {
  emitFlattenHelper,
  emitLocaleHelpers,
  emitPickLocale,
  flattenEntryFieldsFnName,
  flattenFieldsFnName,
} from "./emit/helpers-to-source";
export { zodToSource } from "./emit/zod-to-source";
