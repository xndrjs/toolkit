import { describe, expect, it } from "vitest";
import { formatReactBindingsFile } from "./react-bindings-file.js";

const baseOptions = {
  factoryName: "createI18n",
  paramsTypeName: "MyProjectParams",
  schemaTypeName: "MyProjectSchema",
  localeTypeName: "MyProjectLocale",
  instanceImport: "./instance.generated",
  typesImport: "./i18n-types.generated",
};

describe("formatReactBindingsFile", () => {
  it("emits I18nRoot + withI18n / I18n over a single context", () => {
    const output = formatReactBindingsFile(baseOptions);

    expect(output).toContain("I18nRoot");
    expect(output).toContain("I18nRootProvider");
    expect(output).toContain("useI18nRoot");
    expect(output).toContain("export function withI18n");
    expect(output).toContain("export type I18nProps");
    expect(output).toContain("Ns extends readonly []");
    expect(output).toContain("namespace: never, key: never");
    expect(output).toContain("WithI18nFallback");
    expect(output).toContain("ForwardRefExoticComponent");
    expect(output).toContain("RefAttributes");
    expect(output).toContain("handle.load");
    expect(output).toContain("handle.peek");
    expect(output).toContain("useI18nRootContext()");
    expect(output).not.toContain("fetchImpl");
    expect(output).not.toContain("FetchArtifact");
  });

  it("requires fetchImpl on I18nRoot when loaderStrategy is fetch", () => {
    const output = formatReactBindingsFile({
      ...baseOptions,
      loaderStrategy: "fetch",
    });

    expect(output).toContain("import type { FetchArtifact, I18nCreateInput }");
    expect(output).toContain("fetchImpl: FetchArtifact");
    expect(output).toContain("fetchImpl={fetchImpl}");
  });
});
