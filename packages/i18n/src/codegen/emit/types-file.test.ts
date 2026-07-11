import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatTypesFile } from "./types-file.js";

const projectRoot = "/project";
const typesOutputPath = path.join(projectRoot, "src/i18n/generated/i18n-types.generated.ts");

describe("formatTypesFile", () => {
  it("emits explicit Partial schema types for multi-namespace", () => {
    const output = formatTypesFile({
      isSingle: false,
      entries: [
        { namespace: "default", filePath: "src/i18n/translations/default.json" },
        { namespace: "billing", filePath: "src/i18n/translations/billing.yaml" },
      ],
      projectRoot,
      typesOutputPath,
      paramsTypeName: "AppParams",
      schemaTypeName: "AppSchema",
      localeTypeName: "AppLocale",
      localeFallbackConstName: "LOCALE_FALLBACK",
      localeFallbackTypeName: "AppLocaleFallback",
      paramsByNamespace: {
        default: {
          login_button: "never",
          welcome: "{ name: string }",
        },
        billing: {
          invoice_summary: "{ count: number }",
        },
      },
      requestLocaleUnion: "'en' | 'it'",
      hasLazy: true,
      loadOnInitSet: new Set(["default"]),
      lazyEntries: [{ namespace: "billing", filePath: "src/i18n/translations/billing.yaml" }],
    });

    expect(output).toContain("login_button: Partial<Record<AppLocale, string>>;");
    expect(output).toContain("invoice_summary: Partial<Record<AppLocale, string>>;");
    expect(output).not.toContain("typeof import");
  });

  it("emits explicit Partial schema types for single-file mode", () => {
    const output = formatTypesFile({
      isSingle: true,
      entries: [{ namespace: "translations", filePath: "src/i18n/translations/translations.yaml" }],
      projectRoot,
      typesOutputPath,
      paramsTypeName: "AppParams",
      schemaTypeName: "AppSchema",
      localeTypeName: "AppLocale",
      localeFallbackConstName: "LOCALE_FALLBACK",
      localeFallbackTypeName: "AppLocaleFallback",
      paramsByNamespace: {
        translations: {
          welcome: "{ name: string }",
        },
      },
      requestLocaleUnion: "'en' | 'it'",
      hasLazy: false,
      loadOnInitSet: new Set(),
      lazyEntries: [],
    });

    expect(output).toContain(
      "export type AppSchema = {\n  welcome: Partial<Record<AppLocale, string>>;\n};"
    );
    expect(output).not.toContain("typeof import");
  });

  it("emits delivery area type for custom delivery", () => {
    const output = formatTypesFile({
      isSingle: false,
      entries: [
        { namespace: "default", filePath: "src/i18n/translations/default.json" },
        { namespace: "billing", filePath: "src/i18n/translations/billing.yaml" },
      ],
      projectRoot,
      typesOutputPath,
      paramsTypeName: "AppParams",
      schemaTypeName: "AppSchema",
      localeTypeName: "AppLocale",
      localeFallbackConstName: "LOCALE_FALLBACK",
      localeFallbackTypeName: "AppLocaleFallback",
      localeFallback: {
        "en-US": null,
        it: "en-US",
        fr: null,
      },
      paramsByNamespace: {
        default: { some_key: "never" },
        billing: { invoice_summary: "{ count: number }" },
      },
      requestLocaleUnion: "'en-US' | 'fr' | 'it'",
      deliveryAreaTypeName: "AppDeliveryArea",
      deliveryAreaUnion: "'eu' | 'us'",
      deliveryArtifacts: {
        eu: ["it", "fr"],
        us: ["en-US"],
      },
      hasLazy: true,
      loadOnInitSet: new Set(["default"]),
      lazyEntries: [{ namespace: "billing", filePath: "src/i18n/translations/billing.yaml" }],
    });

    expect(output).toContain("export type AppLocale = 'en-US' | 'fr' | 'it';");
    expect(output).toContain("export type AppDeliveryArea = 'eu' | 'us';");
    expect(output).toContain("export const LOCALE_DELIVERY_AREA = {");
    expect(output).toContain('"it": "eu"');
    expect(output).toContain('"en-US": "us"');
    expect(output).toContain("} as const satisfies Record<AppLocale, AppDeliveryArea>;");
    expect(output).toContain("some_key: Partial<Record<AppLocale, string>>;");
  });
});
