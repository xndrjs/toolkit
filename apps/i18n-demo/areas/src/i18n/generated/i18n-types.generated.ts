// Automatically generated code. Do not edit manually.
export const I18N_MODE = "multi" as const;

export const LOCALE_FALLBACK = {
  en: null,
  "en-US": "en",
  es: null,
  "es-AR": "es",
  fr: null,
  it: "en",
} as const satisfies Record<string, string | null>;

export type MyProjectLocaleFallback = typeof LOCALE_FALLBACK;

export type MyProjectLocale = "en" | "en-US" | "es" | "es-AR" | "fr" | "it";

export type MyProjectDeliveryArea = "amer" | "eu";

export const DELIVERY_ARTIFACTS = {
  amer: ["en-US", "es-AR"] as const,
  eu: ["en", "es", "fr", "it"] as const,
} as const satisfies Record<MyProjectDeliveryArea, readonly MyProjectLocale[]>;

export type MyProjectDeliveryArtifacts = typeof DELIVERY_ARTIFACTS;

export type LocalesForDeliveryArea<A extends MyProjectDeliveryArea> =
  MyProjectDeliveryArtifacts[A][number];

export const LOCALE_DELIVERY_AREA = {
  en: "eu",
  "en-US": "amer",
  es: "eu",
  "es-AR": "amer",
  fr: "eu",
  it: "eu",
} as const satisfies Record<MyProjectLocale, MyProjectDeliveryArea>;

export type MyProjectParams = {
  default: {
    some_key: never;
    some_other_key: never;
    welcome: { name: string };
  };
  billing: {
    invoice_summary: { count: number };
    account_balance: { amount: number };
  };
};

export type MyProjectSchema = {
  default: {
    some_key: Partial<Record<MyProjectLocale, string>>;
    some_other_key: Partial<Record<MyProjectLocale, string>>;
    welcome: Partial<Record<MyProjectLocale, string>>;
  };
  billing: {
    invoice_summary: Partial<Record<MyProjectLocale, string>>;
    account_balance: Partial<Record<MyProjectLocale, string>>;
  };
};
export type LoadOnInitNamespace = never;
export type LazyNamespace = "default" | "billing";
export type InitialSchema = Pick<MyProjectSchema, LoadOnInitNamespace>;
