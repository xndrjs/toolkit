export { defineConfig, type ContentfulToZodConfig } from "./config/define-config";

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
