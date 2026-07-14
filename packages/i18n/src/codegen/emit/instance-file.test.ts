import { describe, expect, it } from "vitest";
import { formatInstanceFile, type InstanceFileOptions } from "./instance-file.js";

function baseOptions(overrides: Partial<InstanceFileOptions> = {}): InstanceFileOptions {
  return {
    isSingle: false,
    hasLazy: false,
    typesOutputPath: "src/i18n/i18n-types.generated.ts",
    paramsTypeName: "AppParams",
    schemaTypeName: "AppSchema",
    localeTypeName: "AppLocale",
    localeFallbackConstName: "LOCALE_FALLBACK",
    factoryName: "createI18n",
    hasLocaleFallback: true,
    hasLocaleType: true,
    namespaceNames: ["default", "billing"],
    importExtension: "none",
    delivery: "canonical",
    ...overrides,
  };
}

function packageImportBlock(output: string): string {
  const match = output.match(/import \{([\s\S]*?)\} from '@xndrjs\/i18n'/);
  return match?.[1] ?? "";
}

describe("formatInstanceFile package imports", () => {
  it("emits only single-scope symbols for single eager projects", () => {
    const imports = packageImportBlock(formatInstanceFile(baseOptions({ isSingle: true })));

    expect(imports).toContain("IcuTranslationProviderSingle");
    expect(imports).toContain("projectNamespaceLocalesCore");
    expect(imports).toContain("type I18nScopeSingle");
    expect(imports).toContain("type OnMissingTranslation");
    expect(imports).not.toContain("createI18nBuilder");
    expect(imports).not.toContain("createI18nMultiBuilder");
    expect(imports).not.toContain("I18nBuilderMultiInitial");
    expect(imports).not.toContain("I18nBuilderMultiOptions");
    expect(imports).not.toContain("I18nBuilderMultiPartitioned");
    expect(imports).not.toContain("I18nScopeMulti");
    expect(imports).not.toContain("projectDictionaryLocalesCore");
  });

  it("emits multi eager scope symbols without builder imports", () => {
    const imports = packageImportBlock(formatInstanceFile(baseOptions()));

    expect(imports).toContain("IcuTranslationProviderMulti");
    expect(imports).toContain("projectDictionaryLocalesCore");
    expect(imports).toContain("type I18nScopeMulti");
    expect(imports).not.toContain("createI18nMultiBuilder");
    expect(imports).not.toContain("I18nBuilderMultiInitial");
    expect(imports).not.toContain("I18nScopeSingle");
  });

  it("emits lazy multi builder symbols instead of I18nScopeMulti", () => {
    const imports = packageImportBlock(
      formatInstanceFile(
        baseOptions({
          hasLazy: true,
          namespaceLoadersOutputPath: "src/i18n/namespace-loaders.generated.ts",
        })
      )
    );

    expect(imports).toContain("createI18nMultiBuilder");
    expect(imports).toContain("type I18nBuilderMultiInitial");
    expect(imports).toContain("type I18nBuilderMultiOptions");
    expect(imports).not.toContain("type I18nScopeMulti");
    expect(imports).not.toContain("createI18nBuilder");
    expect(imports).not.toContain("I18nBuilderMultiPartitioned");
  });

  it("includes delivery-area projection helpers when delivery is custom", () => {
    const imports = packageImportBlock(
      formatInstanceFile(
        baseOptions({
          delivery: "custom",
          deliveryAreaTypeName: "AppDeliveryArea",
          deliveryArtifactsTypeName: "AppDeliveryArtifacts",
        })
      )
    );

    expect(imports).toContain("projectNamespaceForDeliveryAreaCore");
    expect(imports).toContain("projectDictionaryForDeliveryAreaCore");
  });
});
