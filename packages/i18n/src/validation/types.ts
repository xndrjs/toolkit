import type { VariableSpec, VariableType } from "../icu/extract-variables.js";

export type { VariableSpec, VariableType };

export type ParsedLocaleEntry = {
  readonly template: string;
  readonly args: VariableSpec;
};

export type ParsedKeyEntry = {
  readonly locales: Readonly<Record<string, ParsedLocaleEntry>>;
  readonly mergedArgs: VariableSpec;
};

export type NormalizedKeyDictionary = Readonly<Record<string, ParsedKeyEntry>>;

export type NormalizedMultiDictionary = Readonly<Record<string, NormalizedKeyDictionary>>;

export type NormalizedDictionary =
  | { readonly mode: "single"; readonly keys: NormalizedKeyDictionary }
  | { readonly mode: "multi"; readonly namespaces: NormalizedMultiDictionary };

export type DictionarySpec =
  | {
      readonly mode: "single";
      readonly requiredKeys: readonly string[];
      readonly argsByKey: Readonly<Record<string, VariableSpec>>;
    }
  | {
      readonly mode: "multi";
      readonly requiredKeys: Readonly<Record<string, readonly string[]>>;
      readonly argsByKey: Readonly<Record<string, Readonly<Record<string, VariableSpec>>>>;
    };

export type ValidationIssue =
  | {
      readonly kind: "invalid_input";
      readonly message: string;
    }
  | {
      readonly kind: "missing_key";
      readonly path: readonly string[];
    }
  | {
      readonly kind: "unknown_key";
      readonly path: readonly string[];
    }
  | {
      readonly kind: "invalid_locale_value";
      readonly path: readonly string[];
      readonly message: string;
    }
  | {
      readonly kind: "icu_syntax_error";
      readonly path: readonly string[];
      readonly message: string;
    }
  | {
      readonly kind: "locale_args_mismatch";
      readonly path: readonly string[];
      readonly locales: Readonly<Record<string, VariableSpec>>;
      readonly message: string;
    }
  | {
      readonly kind: "variable_mismatch";
      readonly path: readonly string[];
      readonly expected: VariableSpec;
      readonly found: VariableSpec;
      readonly message: string;
    }
  | {
      readonly kind: "variable_type_mismatch";
      readonly path: readonly string[];
      readonly variable: string;
      readonly expected: VariableType;
      readonly found: VariableType;
      readonly message: string;
    };

export type ValidationResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };
