/** Status of a lazy builder resource (`namespace` × partition). */
export type I18nResourceLoadStatus = "pending" | "loaded" | "error";

/** One tracked resource entry in {@link I18nLoadState}. */
export interface I18nResourceLoadRecord {
  namespace: string;
  partition: string;
  status: I18nResourceLoadStatus;
  error?: unknown;
}

/** Global snapshot of resource loads attempted on an i18n handle. */
export interface I18nLoadState {
  resources: readonly I18nResourceLoadRecord[];
}
