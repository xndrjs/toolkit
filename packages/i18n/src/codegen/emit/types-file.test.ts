import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatTypesFile } from "./types-file.js";

const projectRoot = "/project";
const typesOutputPath = path.join(projectRoot, "src/i18n/generated/i18n-types.generated.ts");

describe("formatTypesFile", () => {
  it("emits explicit Partial schema types and lazy aliases", () => {
    const output = formatTypesFile({
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
      requestLocales: ["en", "it"],
      lazyEntries: [
        { namespace: "default", filePath: "src/i18n/translations/default.json" },
        { namespace: "billing", filePath: "src/i18n/translations/billing.yaml" },
      ],
    });

    expect(output).toContain("login_button: Partial<Record<AppLocale, string>>;");
    expect(output).toContain("invoice_summary: Partial<Record<AppLocale, string>>;");
    expect(output).toContain('export const AppLocales = ["en", "it"] as const;');
    expect(output).toContain("export type AppLocale = (typeof AppLocales)[number];");
    expect(output).toContain("export type LazyNamespace = 'default' | 'billing'");
    expect(output).toContain("export type InitialSchema = Record<string, never>");
  });

  it("emits delivery area type for custom delivery", () => {
    const output = formatTypesFile({
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
      requestLocales: ["en-US", "fr", "it"],
      deliveryAreaTypeName: "AppDeliveryArea",
      deliveryAreaNames: ["eu", "us"],
      deliveryArtifacts: {
        eu: ["it", "fr"],
        us: ["en-US"],
      },
      lazyEntries: [
        { namespace: "default", filePath: "src/i18n/translations/default.json" },
        { namespace: "billing", filePath: "src/i18n/translations/billing.yaml" },
      ],
    });

    expect(output).toContain('export const AppLocales = ["en-US", "fr", "it"] as const;');
    expect(output).toContain("export type AppLocale = (typeof AppLocales)[number];");
    expect(output).toContain('export const AppDeliveryAreas = ["eu", "us"] as const;');
    expect(output).toContain("export type AppDeliveryArea = (typeof AppDeliveryAreas)[number];");
    expect(output).toContain("export const DELIVERY_ARTIFACTS = {");
    expect(output).toContain('"eu": ["fr", "it"] as const');
    expect(output).toContain('"us": ["en-US"] as const');
    expect(output).toContain("} as const satisfies Record<AppDeliveryArea, readonly AppLocale[]>;");
    expect(output).toContain("export type AppDeliveryArtifacts = typeof DELIVERY_ARTIFACTS;");
    expect(output).toContain("export const LOCALE_DELIVERY_AREA = {");
    expect(output).toContain('"it": "eu"');
    expect(output).toContain('"en-US": "us"');
    expect(output).toContain("} as const satisfies Record<AppLocale, AppDeliveryArea>;");
    expect(output).toContain("some_key: Partial<Record<AppLocale, string>>;");
  });
});
