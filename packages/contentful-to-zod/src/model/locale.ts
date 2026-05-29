/** Subset of a Contentful locale from the CMA `/locales` collection. */
export interface Locale {
  code: string;
  default: boolean;
  fallbackCode?: string | null;
}
