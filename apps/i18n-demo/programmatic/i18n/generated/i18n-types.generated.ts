// Automatically generated code. Do not edit manually.
export const I18N_MODE = "multi" as const;

export const LOCALE_FALLBACK = {
  en: null,
  it: "en",
} as const satisfies Record<string, string | null>;

export type ProgrammaticDemoLocaleFallback = typeof LOCALE_FALLBACK;

export const ProgrammaticDemoLocales = ["en", "it"] as const;
export type ProgrammaticDemoLocale = (typeof ProgrammaticDemoLocales)[number];

export type ProgrammaticDemoParams = {
  default: {
    welcome: { name: string };
  };
  cms: {
    footer_note: never;
  };
};

export type ProgrammaticDemoSchema = {
  default: {
    welcome: Partial<Record<ProgrammaticDemoLocale, string>>;
  };
  cms: {
    footer_note: Partial<Record<ProgrammaticDemoLocale, string>>;
  };
};
export type LazyNamespace = "default" | "cms";
/** Empty cold-start schema — namespaces arrive via `namespaceLoaders`. */
export type InitialSchema = Record<string, never>;
