import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { codegenConfigKeys, resolveCodegenPaths } from "./codegen-config-schema.js";
import { loadConfig, resolveArtifactsPath } from "./config.js";

function writeConfig(dir: string, config: Record<string, unknown>) {
  const configPath = join(dir, "i18n.codegen.json");
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  return configPath;
}

const validMultiConfig = {
  projectName: "App",
  namespaces: {
    default: "translations/default.json",
  },
  codegenPath: "generated",
};

describe("loadConfig", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("accepts a valid multi-namespace config and defaults delivery to split-by-locale", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-config-"));
    const configPath = writeConfig(tempDir, validMultiConfig);

    expect(loadConfig(configPath)).toEqual({
      ...validMultiConfig,
      delivery: "split-by-locale",
      loaderStrategy: "import",
    });
  });

  it("accepts fetch loaderStrategy", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-config-"));
    const configPath = writeConfig(tempDir, {
      ...validMultiConfig,
      loaderStrategy: "fetch",
    });

    expect(loadConfig(configPath)).toMatchObject({
      loaderStrategy: "fetch",
    });
  });

  it("rejects unknown config keys", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-config-"));
    const configPath = writeConfig(tempDir, {
      ...validMultiConfig,
      notARealKey: true,
    });

    expect(() => loadConfig(configPath)).toThrow();
  });

  it("resolves code paths and type names from projectName + codegenPath", () => {
    expect(resolveCodegenPaths(validMultiConfig)).toMatchObject({
      typesOutput: "generated/i18n-types.generated.ts",
      instanceOutput: "generated/instance.generated.ts",
      namespaceLoadersOutput: "generated/namespace-loaders.generated.ts",
      dictionarySchemaOutput: "generated/dictionary-schema.generated.ts",
      artifactsPath: "generated",
      paramsTypeName: "AppParams",
      schemaTypeName: "AppSchema",
      localeTypeName: "AppLocale",
      factoryName: "createI18n",
      localeFallbackConstName: "LOCALE_FALLBACK",
    });
  });

  it("throws on invalid config JSON", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-config-"));
    const configPath = join(tempDir, "i18n.codegen.json");
    writeFileSync(configPath, "{ not json");

    expect(() => loadConfig(configPath)).toThrow(
      `[Codegen Error] Failed to parse config JSON (${configPath})`
    );
  });

  it("throws on unknown top-level keys and reports allowed keys", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-config-"));
    const configPath = writeConfig(tempDir, {
      ...validMultiConfig,
      typoKey: true,
    });

    const act = () => loadConfig(configPath);
    expect(act).toThrow("Invalid i18n.codegen.json");
    expect(act).toThrow("typoKey");
    expect(act).toThrow(`Allowed keys: ${codegenConfigKeys.join(", ")}`);
  });

  it("throws when required fields are missing", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-config-"));
    const configPath = writeConfig(tempDir, {
      namespaces: validMultiConfig.namespaces,
    });

    const act = () => loadConfig(configPath);
    expect(act).toThrow("projectName");
    expect(act).toThrow("codegenPath");
    expect(act).toThrow("Allowed keys:");
  });

  it("throws when projectName is not PascalCase", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-config-"));
    const configPath = writeConfig(tempDir, {
      ...validMultiConfig,
      projectName: "my-app",
    });

    expect(() => loadConfig(configPath)).toThrow("projectName must be PascalCase");
  });

  it("throws when a namespace name is not a valid identifier", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-config-"));
    const configPath = writeConfig(tempDir, {
      ...validMultiConfig,
      namespaces: {
        default: "translations/default.json",
        "user-area": "translations/user-area.json",
      },
    });

    expect(() => loadConfig(configPath)).toThrow(
      'Invalid namespace name "user-area" (allowed: letters, digits, underscore; must not start with a digit).'
    );
  });

  it("accepts artifactsPath for custom json artifact directory", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-config-"));
    const configPath = writeConfig(tempDir, {
      ...validMultiConfig,
      artifactsPath: "public/i18n",
    });

    expect(loadConfig(configPath)).toMatchObject({
      artifactsPath: "public/i18n",
      delivery: "split-by-locale",
    });
  });

  it("resolveArtifactsPath defaults to codegenPath", () => {
    expect(
      resolveArtifactsPath({
        codegenPath: "generated",
      })
    ).toBe("generated");
    expect(
      resolveArtifactsPath({
        codegenPath: "generated",
        artifactsPath: "public/i18n",
      })
    ).toBe("public/i18n");
  });

  it("accepts custom delivery with deliveryArtifacts", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-config-"));
    const configPath = writeConfig(tempDir, {
      ...validMultiConfig,
      delivery: "custom",
      deliveryArtifacts: {
        eu: ["it", "fr"],
        us: ["en-US"],
      },
      localeFallback: {
        "en-US": null,
        it: "en-US",
        fr: null,
      },
    });

    expect(loadConfig(configPath)).toMatchObject({
      delivery: "custom",
      deliveryArtifacts: {
        eu: ["it", "fr"],
        us: ["en-US"],
      },
    });
  });

  it("throws when delivery is custom without deliveryArtifacts", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-config-"));
    const configPath = writeConfig(tempDir, {
      ...validMultiConfig,
      delivery: "custom",
    });

    expect(() => loadConfig(configPath)).toThrow(
      'deliveryArtifacts is required when delivery is "custom"'
    );
  });

  it("throws when deliveryArtifacts is set for non-custom delivery", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-config-"));
    const configPath = writeConfig(tempDir, {
      ...validMultiConfig,
      delivery: "split-by-locale",
      deliveryArtifacts: {
        eu: ["it"],
      },
    });

    expect(() => loadConfig(configPath)).toThrow(
      'deliveryArtifacts is only allowed when delivery is "custom"'
    );
  });

  it("throws when deliveryArtifacts has duplicate locales across areas", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-config-"));
    const configPath = writeConfig(tempDir, {
      ...validMultiConfig,
      delivery: "custom",
      deliveryArtifacts: {
        eu: ["it", "fr"],
        us: ["fr"],
      },
    });

    expect(() => loadConfig(configPath)).toThrow('Locale "fr" appears in both "eu" and "us"');
  });
});
