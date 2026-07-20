import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatNamespaceLoadersFile } from "./namespace-loaders-file.js";

const projectRoot = "/project";
const loadersOutputPath = path.join(projectRoot, "src/i18n/namespace-loaders.generated.ts");

describe("formatNamespaceLoadersFile", () => {
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
      localeTypeName: "AppLocale",
      typesModule: "i18n-types.generated",
      importExtension: "none",
      projectRoot,
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

    expect(output).toContain(
      "import type { AppSchema, LazyNamespace, AppLocale } from './i18n-types.generated';"
    );
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
    expect(output).toContain(
      'export const defaultLazyNamespaces = ["billing", "default", "user"] as const;'
    );
    expect(output.match(/from '\.\/i18n-types\.generated'/g)?.length).toBe(1);
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
        localeTypeName: "AppLocale",
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
      localeTypeName: "AppLocale",
      typesModule: "i18n-types.generated",
      importExtension: "none",
      projectRoot,
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
      "import type { AppSchema, LazyNamespace, AppDeliveryArea } from './i18n-types.generated';"
    );
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
        localeTypeName: "AppLocale",
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

  it("emits fetch loaders that pass a resource id to fetchImpl", () => {
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
      localeTypeName: "AppLocale",
      typesModule: "i18n-types.generated",
      importExtension: "none",
      projectRoot,
      delivery: "split-by-locale",
      requestLocales: ["en", "it"],
      loaderStrategy: "fetch",
      splitPathsByNamespace: {
        billing: {
          en: "src/i18n/generated/translations/billing.en.json",
          it: "src/i18n/generated/translations/billing.it.json",
        },
      },
    });

    expect(output).toContain("export function createNamespaceLoaders");
    expect(output).toContain("import type { FetchArtifact }");
    expect(output).toContain(
      'fetchImpl({ locale, namespace: "billing" }) as Promise<AppSchema["billing"]>'
    );
  });

  it("emits custom-delivery fetch loaders with locale + area", () => {
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
      localeTypeName: "AppLocale",
      typesModule: "i18n-types.generated",
      importExtension: "none",
      projectRoot,
      delivery: "custom",
      deliveryAreaTypeName: "AppDeliveryArea",
      deliveryAreaNames: ["eu", "us"],
      loaderStrategy: "fetch",
      splitPathsByNamespace: {
        billing: {
          eu: "src/i18n/generated/translations/billing.eu.json",
          us: "src/i18n/generated/translations/billing.us.json",
        },
      },
    });

    expect(output).toContain("(area, { locale }) =>");
    expect(output).toContain(
      'fetchImpl({ locale, namespace: "billing", area }) as Promise<AppSchema["billing"]>'
    );
  });
});
