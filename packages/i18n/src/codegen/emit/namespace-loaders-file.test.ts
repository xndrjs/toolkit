import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatNamespaceLoadersFile } from "./namespace-loaders-file.js";

const projectRoot = "/project";
const loadersOutputPath = path.join(projectRoot, "src/i18n/namespace-loaders.generated.ts");

describe("formatNamespaceLoadersFile", () => {
  it("emits flat loaders in canonical mode", () => {
    const output = formatNamespaceLoadersFile({
      loadersOutputPath,
      lazyEntries: [
        {
          namespace: "billing",
          filePath: "src/i18n/translations/billing.json",
          absolutePath: path.join(projectRoot, "src/i18n/translations/billing.json"),
        },
      ],
      schemaTypeName: "AppSchema",
      paramsTypeName: "AppParams",
      localeTypeName: "AppLocale",
      localeFallbackConstName: "LOCALE_FALLBACK",
      hasLocaleFallback: false,
      typesModule: "i18n-types.generated",
      importExtension: "none",
      projectRoot,
      delivery: "canonical",
    });

    expect(output).toContain("[K in LazyNamespace]: () => Promise<AppSchema[K]>");
    expect(output).toContain(
      "billing: () => import('./translations/billing.json').then((m) => m.default),"
    );
    expect(output).not.toContain("AppLocale");
    expect(output).not.toContain("ensureNamespacesLoadedForLocale");
  });

  it("emits ns(locale) loaders in split mode", () => {
    const output = formatNamespaceLoadersFile({
      loadersOutputPath,
      lazyEntries: [
        {
          namespace: "billing",
          filePath: "src/i18n/translations/billing.json",
          absolutePath: path.join(projectRoot, "src/i18n/translations/billing.json"),
        },
        {
          namespace: "default",
          filePath: "src/i18n/translations/default.json",
          absolutePath: path.join(projectRoot, "src/i18n/translations/default.json"),
        },
        {
          namespace: "user",
          filePath: "src/i18n/translations/user.json",
          absolutePath: path.join(projectRoot, "src/i18n/translations/user.json"),
        },
      ],
      schemaTypeName: "AppSchema",
      paramsTypeName: "AppParams",
      localeTypeName: "AppLocale",
      localeFallbackConstName: "LOCALE_FALLBACK",
      hasLocaleFallback: true,
      typesModule: "i18n-types.generated",
      importExtension: "none",
      projectRoot,
      isSingle: false,
      delivery: "split-by-locale",
      requestLocales: ["en", "it", "de-CH"],
      splitPathsByNamespace: {
        billing: {
          en: "src/i18n/generated/translations/billing.en.json",
          it: "src/i18n/generated/translations/billing.it.json",
          "de-CH": "src/i18n/generated/translations/billing.de-CH.json",
        },
        default: {
          en: "src/i18n/generated/translations/default.en.json",
          it: "src/i18n/generated/translations/default.it.json",
          "de-CH": "src/i18n/generated/translations/default.de-CH.json",
        },
        user: {
          en: "src/i18n/generated/translations/user.en.json",
          it: "src/i18n/generated/translations/user.it.json",
          "de-CH": "src/i18n/generated/translations/user.de-CH.json",
        },
      },
    });

    expect(output).toContain("[K in LazyNamespace]: (locale: AppLocale) => Promise<AppSchema[K]>;");
    expect(output).toContain("billing: (locale) => {");
    expect(output).toContain('case "en":');
    expect(output).toContain('case "it":');
    expect(output).toContain('case "de-CH":');
    expect(output).toContain(
      'throw new Error(`[i18n] No translation artifact for namespace "billing" and locale "${String(locale)}".`);'
    );
    expect(output).toContain(
      "return import('./generated/translations/billing.en.json').then((m) => m.default);"
    );
    expect(output).toContain("user: (locale) => {");
    expect(output).not.toContain("billing: {");
    expect(output).not.toContain("import('./translations/billing.json')");
    expect(output).not.toContain("ensureNamespacesLoadedForLocale");
    expect(output).toContain(
      'export const defaultLazyNamespaces = ["billing", "default", "user"] as const;'
    );
    expect(output.match(/from '\.\/i18n-types\.generated'/g)?.length).toBe(1);
  });

  it("emits mergeAll helper for single mode in split delivery", () => {
    const output = formatNamespaceLoadersFile({
      loadersOutputPath,
      lazyEntries: [
        {
          namespace: "default",
          filePath: "src/i18n/translations/translations.json",
          absolutePath: path.join(projectRoot, "src/i18n/translations/translations.json"),
        },
      ],
      schemaTypeName: "AppSchema",
      paramsTypeName: "AppParams",
      localeTypeName: "AppLocale",
      localeFallbackConstName: "LOCALE_FALLBACK",
      hasLocaleFallback: true,
      typesModule: "i18n-types.generated",
      importExtension: "none",
      projectRoot,
      isSingle: true,
      delivery: "split-by-locale",
      requestLocales: ["en", "it"],
      splitPathsByNamespace: {
        default: {
          en: "src/i18n/generated/translations/translations.en.json",
          it: "src/i18n/generated/translations/translations.it.json",
        },
      },
    });

    expect(output).toContain("[K in LazyNamespace]: (locale: AppLocale) => Promise<AppSchema>;");
    expect(output).not.toContain("TranslationProviderSingle");
    expect(output).not.toContain("ensureNamespacesLoadedForLocale");
    expect(output).toContain('export const defaultLazyNamespaces = ["default"] as const;');
  });

  it("throws when a split path is missing", () => {
    expect(() =>
      formatNamespaceLoadersFile({
        loadersOutputPath,
        lazyEntries: [
          {
            namespace: "billing",
            filePath: "src/i18n/translations/billing.json",
            absolutePath: path.join(projectRoot, "src/i18n/translations/billing.json"),
          },
        ],
        schemaTypeName: "AppSchema",
        paramsTypeName: "AppParams",
        localeTypeName: "AppLocale",
        localeFallbackConstName: "LOCALE_FALLBACK",
        hasLocaleFallback: false,
        typesModule: "i18n-types.generated",
        importExtension: "none",
        projectRoot,
        delivery: "split-by-locale",
        requestLocales: ["en", "it"],
        splitPathsByNamespace: {
          billing: {
            en: "src/i18n/generated/translations/billing.en.json",
          },
        },
      })
    ).toThrow('[Codegen Error] Missing split path for namespace "billing", locale "it".');
  });

  it("emits ns(area) loaders in custom mode", () => {
    const output = formatNamespaceLoadersFile({
      loadersOutputPath,
      lazyEntries: [
        {
          namespace: "billing",
          filePath: "src/i18n/translations/billing.json",
          absolutePath: path.join(projectRoot, "src/i18n/translations/billing.json"),
        },
        {
          namespace: "default",
          filePath: "src/i18n/translations/default.json",
          absolutePath: path.join(projectRoot, "src/i18n/translations/default.json"),
        },
      ],
      schemaTypeName: "AppSchema",
      paramsTypeName: "AppParams",
      localeTypeName: "AppLocale",
      localeFallbackConstName: "LOCALE_FALLBACK",
      hasLocaleFallback: true,
      typesModule: "i18n-types.generated",
      importExtension: "none",
      projectRoot,
      isSingle: false,
      delivery: "custom",
      deliveryAreaTypeName: "AppDeliveryArea",
      deliveryAreaNames: ["eu", "us"],
      splitPathsByNamespace: {
        billing: {
          eu: "src/i18n/generated/translations/billing.eu.json",
          us: "src/i18n/generated/translations/billing.us.json",
        },
        default: {
          eu: "src/i18n/generated/translations/default.eu.json",
          us: "src/i18n/generated/translations/default.us.json",
        },
      },
    });

    expect(output).toContain(
      "[K in LazyNamespace]: (area: AppDeliveryArea) => Promise<AppSchema[K]>;"
    );
    expect(output).toContain("billing: (area) => {");
    expect(output).toContain('case "eu":');
    expect(output).toContain('case "us":');
    expect(output).toContain(
      'throw new Error(`[i18n] No translation artifact for namespace "billing" and area "${String(area)}".`);'
    );
    expect(output).toContain(
      "return import('./generated/translations/billing.eu.json').then((m) => m.default);"
    );
    expect(output).not.toContain("import('./translations/billing.json')");
    expect(output).not.toContain("ensureNamespacesLoadedForArea");
    expect(output).toContain(
      'export const defaultLazyNamespaces = ["billing", "default"] as const;'
    );
  });

  it("throws when a custom delivery split path is missing", () => {
    expect(() =>
      formatNamespaceLoadersFile({
        loadersOutputPath,
        lazyEntries: [
          {
            namespace: "billing",
            filePath: "src/i18n/translations/billing.json",
            absolutePath: path.join(projectRoot, "src/i18n/translations/billing.json"),
          },
        ],
        schemaTypeName: "AppSchema",
        paramsTypeName: "AppParams",
        localeTypeName: "AppLocale",
        localeFallbackConstName: "LOCALE_FALLBACK",
        hasLocaleFallback: false,
        typesModule: "i18n-types.generated",
        importExtension: "none",
        projectRoot,
        delivery: "custom",
        deliveryAreaTypeName: "AppDeliveryArea",
        deliveryAreaNames: ["eu", "us"],
        splitPathsByNamespace: {
          billing: {
            eu: "src/i18n/generated/translations/billing.eu.json",
          },
        },
      })
    ).toThrow('[Codegen Error] Missing split path for namespace "billing", area "us".');
  });
});
