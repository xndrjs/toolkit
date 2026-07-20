import { describe, expect, it } from "vitest";
import { formatInstanceFile, type InstanceFileOptions } from "./instance-file.js";

function baseOptions(overrides: Partial<InstanceFileOptions> = {}): InstanceFileOptions {
  return {
    typesOutputPath: "src/i18n/i18n-types.generated.ts",
    namespaceLoadersOutputPath: "src/i18n/namespace-loaders.generated.ts",
    paramsTypeName: "AppParams",
    schemaTypeName: "AppSchema",
    localeTypeName: "AppLocale",
    localeFallbackConstName: "LOCALE_FALLBACK",
    factoryName: "createI18n",
    hasLocaleFallback: true,
    hasLocaleType: true,
    importExtension: "none",
    delivery: "split-by-locale",
    ...overrides,
  };
}

function packageImportBlock(output: string): string {
  const match = output.match(/import \{([\s\S]*?)\} from '@xndrjs\/i18n'/);
  return match?.[1] ?? "";
}

describe("formatInstanceFile package imports", () => {
  it("emits lazy multi handle symbols", () => {
    const output = formatInstanceFile(baseOptions());
    const imports = packageImportBlock(output);

    expect(imports).toContain("IcuTranslationProviderMulti");
    expect(imports).toContain("createI18nHandle");
    expect(imports).toContain("type I18nHandle");
    expect(imports).toContain("type I18nHandleOptions");
    expect(output).toContain("partitionForLocale: (locale) => locale");
    expect(output).toContain("I18nHandle<AppSchema, AppParams, AppLocale>");
    expect(output).toContain(
      "options?: { state?: { dictionary: InitialSchema; resources?: readonly (readonly [string, string])[] }; onMissing?: OnMissingTranslation }"
    );
    expect(output).toContain("const { state, ...providerOptions } = options ?? {}");
  });

  it("injects LOCALE_DELIVERY_AREA for custom delivery", () => {
    const output = formatInstanceFile(
      baseOptions({
        delivery: "custom",
        localeDeliveryAreaConstName: "LOCALE_DELIVERY_AREA",
      })
    );

    expect(output).toContain("LOCALE_DELIVERY_AREA");
    expect(output).toContain("partitionForLocale: (locale) => LOCALE_DELIVERY_AREA[locale]");
  });

  it("wires createNamespaceLoaders + required fetchImpl in options bag", () => {
    const output = formatInstanceFile(
      baseOptions({
        loaderStrategy: "fetch",
      })
    );

    expect(output).toContain("type FetchArtifact");
    expect(output).toContain("import { createNamespaceLoaders }");
    expect(output).toContain(
      "options: { fetchImpl: FetchArtifact; state?: { dictionary: InitialSchema; resources?: readonly (readonly [string, string])[] }; onMissing?: OnMissingTranslation }"
    );
    expect(output).toContain("const { fetchImpl, state, ...providerOptions } = options;");
    expect(output).toContain("createNamespaceLoaders(fetchImpl)");
    expect(output).not.toContain("import { namespaceLoaders }");
  });
});
