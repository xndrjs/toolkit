import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatDictionaryFile } from "./dictionary-file.js";

const projectRoot = "/project";
const dictionaryOutputPath = path.join(projectRoot, "src/i18n/dictionary.generated.ts");
const typesOutputPath = path.join(projectRoot, "src/i18n/i18n-types.generated.ts");

describe("formatDictionaryFile", () => {
  it("emits defaultDictionary in canonical mode", () => {
    const output = formatDictionaryFile({
      isSingle: false,
      hasLazy: true,
      entries: [
        { namespace: "default", filePath: "src/i18n/translations/default.json" },
        { namespace: "billing", filePath: "src/i18n/translations/billing.json" },
      ],
      eagerEntries: [{ namespace: "default", filePath: "src/i18n/translations/default.json" }],
      projectRoot,
      dictionaryOutputPath,
      typesOutputPath,
      schemaTypeName: "AppSchema",
      localeTypeName: "AppLocale",
      importExtension: "none",
      delivery: "canonical",
    });

    expect(output).toContain("export const defaultDictionary: InitialSchema");
    expect(output).toContain("defaultNs");
    expect(output).not.toContain("defaultDictionaryFor");
  });

  it("emits an empty module when all namespaces are lazy in split mode (multi)", () => {
    const output = formatDictionaryFile({
      isSingle: false,
      hasLazy: true,
      entries: [
        { namespace: "default", filePath: "src/i18n/translations/default.json" },
        { namespace: "billing", filePath: "src/i18n/translations/billing.json" },
      ],
      eagerEntries: [],
      projectRoot,
      dictionaryOutputPath,
      typesOutputPath,
      schemaTypeName: "AppSchema",
      localeTypeName: "AppLocale",
      importExtension: "none",
      delivery: "split-by-locale",
      requestLocales: ["en", "it"],
      splitPathsByNamespace: {
        default: {
          en: "src/i18n/generated/translations/default.en.json",
          it: "src/i18n/generated/translations/default.it.json",
        },
        billing: {
          en: "src/i18n/generated/translations/billing.en.json",
          it: "src/i18n/generated/translations/billing.it.json",
        },
      },
    });

    expect(output).toBeNull();
  });

  it("emits defaultDictionaryFor with per-locale imports in split mode (multi)", () => {
    const output = formatDictionaryFile({
      isSingle: false,
      hasLazy: true,
      entries: [
        { namespace: "default", filePath: "src/i18n/translations/default.json" },
        { namespace: "billing", filePath: "src/i18n/translations/billing.json" },
      ],
      eagerEntries: [{ namespace: "default", filePath: "src/i18n/translations/default.json" }],
      projectRoot,
      dictionaryOutputPath,
      typesOutputPath,
      schemaTypeName: "AppSchema",
      localeTypeName: "AppLocale",
      importExtension: "none",
      delivery: "split-by-locale",
      requestLocales: ["en", "it"],
      splitPathsByNamespace: {
        default: {
          en: "src/i18n/generated/translations/default.en.json",
          it: "src/i18n/generated/translations/default.it.json",
        },
        billing: {
          en: "src/i18n/generated/translations/billing.en.json",
          it: "src/i18n/generated/translations/billing.it.json",
        },
      },
    });

    expect(output).toContain("import defaultEn from './generated/translations/default.en.json';");
    expect(output).toContain("import defaultIt from './generated/translations/default.it.json';");
    expect(output).toContain(
      "const defaultByLocale = {\n  en: defaultEn,\n  it: defaultIt,\n} as const;"
    );
    expect(output).toContain(
      "export function defaultDictionaryFor(locale: AppLocale): InitialSchema"
    );
    expect(output).toContain("return {\n    default: defaultByLocale[locale],\n  };");
    expect(output).not.toContain("export const defaultDictionary");
    expect(output).not.toContain("billingEn");
  });

  it("emits defaultDictionaryFor with per-locale imports in split mode (single)", () => {
    const output = formatDictionaryFile({
      isSingle: true,
      hasLazy: false,
      entries: [{ namespace: "translations", filePath: "src/i18n/translations/translations.json" }],
      eagerEntries: [
        { namespace: "translations", filePath: "src/i18n/translations/translations.json" },
      ],
      projectRoot,
      dictionaryOutputPath,
      typesOutputPath,
      schemaTypeName: "AppSchema",
      localeTypeName: "AppLocale",
      importExtension: "none",
      delivery: "split-by-locale",
      requestLocales: ["en", "it"],
      splitPathsByNamespace: {
        translations: {
          en: "src/i18n/generated/translations/translations.en.json",
          it: "src/i18n/generated/translations/translations.it.json",
        },
      },
    });

    expect(output).toContain(
      "import translationsEn from './generated/translations/translations.en.json';"
    );
    expect(output).toContain(
      "import translationsIt from './generated/translations/translations.it.json';"
    );
    expect(output).toContain("export function defaultDictionaryFor(locale: AppLocale): AppSchema");
    expect(output).toContain("return translationsByLocale[locale];");
    expect(output).not.toContain("export const defaultDictionary");
  });

  it("emits defaultDictionaryFor with per-area imports in custom mode (multi)", () => {
    const output = formatDictionaryFile({
      isSingle: false,
      hasLazy: true,
      entries: [
        { namespace: "default", filePath: "src/i18n/translations/default.json" },
        { namespace: "billing", filePath: "src/i18n/translations/billing.json" },
      ],
      eagerEntries: [{ namespace: "default", filePath: "src/i18n/translations/default.json" }],
      projectRoot,
      dictionaryOutputPath,
      typesOutputPath,
      schemaTypeName: "AppSchema",
      localeTypeName: "AppLocale",
      importExtension: "none",
      delivery: "custom",
      deliveryAreaTypeName: "AppDeliveryArea",
      deliveryAreaNames: ["eu", "us"],
      splitPathsByNamespace: {
        default: {
          eu: "src/i18n/generated/translations/default.eu.json",
          us: "src/i18n/generated/translations/default.us.json",
        },
        billing: {
          eu: "src/i18n/generated/translations/billing.eu.json",
          us: "src/i18n/generated/translations/billing.us.json",
        },
      },
    });

    expect(output).toContain("import defaultEu from './generated/translations/default.eu.json';");
    expect(output).toContain("import defaultUs from './generated/translations/default.us.json';");
    expect(output).toContain(
      "const defaultByArea = {\n  eu: defaultEu,\n  us: defaultUs,\n} as const;"
    );
    expect(output).toContain(
      "export function defaultDictionaryFor(area: AppDeliveryArea): InitialSchema"
    );
    expect(output).toContain("return {\n    default: defaultByArea[area],\n  };");
    expect(output).not.toContain("export const defaultDictionary");
    expect(output).not.toContain("billingEu");
  });

  it("emits defaultDictionaryFor with per-area imports in custom mode (single)", () => {
    const output = formatDictionaryFile({
      isSingle: true,
      hasLazy: false,
      entries: [{ namespace: "translations", filePath: "src/i18n/translations/translations.json" }],
      eagerEntries: [
        { namespace: "translations", filePath: "src/i18n/translations/translations.json" },
      ],
      projectRoot,
      dictionaryOutputPath,
      typesOutputPath,
      schemaTypeName: "AppSchema",
      localeTypeName: "AppLocale",
      importExtension: "none",
      delivery: "custom",
      deliveryAreaTypeName: "AppDeliveryArea",
      deliveryAreaNames: ["eu", "us"],
      splitPathsByNamespace: {
        translations: {
          eu: "src/i18n/generated/translations/translations.eu.json",
          us: "src/i18n/generated/translations/translations.us.json",
        },
      },
    });

    expect(output).toContain(
      "import translationsEu from './generated/translations/translations.eu.json';"
    );
    expect(output).toContain(
      "import translationsUs from './generated/translations/translations.us.json';"
    );
    expect(output).toContain(
      "export function defaultDictionaryFor(area: AppDeliveryArea): AppSchema"
    );
    expect(output).toContain("return translationsByArea[area];");
    expect(output).not.toContain("export const defaultDictionary");
  });
});
