// Automatically generated code. Do not edit manually.
export const I18N_MODE = "single" as const;

export const LOCALE_FALLBACK = {
  en: null,
  it: "en",
} as const satisfies Record<string, string | null>;

export type ProgrammaticDemoLocaleFallback = typeof LOCALE_FALLBACK;

export type ProgrammaticDemoLocale = "en" | "it";

export type ProgrammaticDemoParams = {
  welcome: { name: string };
};

export type ProgrammaticDemoSchema = {
  welcome: Partial<Record<ProgrammaticDemoLocale, string>>;
};
