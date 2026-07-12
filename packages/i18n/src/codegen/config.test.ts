import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { codegenConfigKeys } from "./codegen-config-schema.js";
import { loadConfig, resolveDeliveryOutputDir, resolveLoadOnInit } from "./config.js";
import { resolveImportExtension } from "./paths.js";

function writeConfig(dir: string, config: Record<string, unknown>) {
  const configPath = join(dir, "i18n.codegen.json");
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  return configPath;
}

const validMultiConfig = {
  namespaces: {
    default: "translations/default.json",
  },
  typesOutput: "generated/i18n-types.generated.ts",
  dictionaryOutput: "generated/dictionary.generated.ts",
  instanceOutput: "generated/instance.generated.ts",
  paramsTypeName: "AppParams",
  schemaTypeName: "AppSchema",
};

describe("loadConfig", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("accepts a valid multi-namespace config", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-config-"));
    const configPath = writeConfig(tempDir, validMultiConfig);

    expect(loadConfig(configPath)).toEqual({
      ...validMultiConfig,
      delivery: "canonical",
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

  it("throws when both dictionary and namespaces are present", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-config-"));
    const configPath = writeConfig(tempDir, {
      ...validMultiConfig,
      dictionary: "translations/default.json",
    });

    expect(() => loadConfig(configPath)).toThrow(
      'Specify exactly one of "dictionary" or "namespaces".'
    );
  });

  it("throws when required fields are missing", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-config-"));
    const configPath = writeConfig(tempDir, {
      namespaces: validMultiConfig.namespaces,
    });

    const act = () => loadConfig(configPath);
    expect(act).toThrow("typesOutput");
    expect(act).toThrow("Allowed keys:");
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

  it("throws when defaultNamespace is not a valid identifier", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-config-"));
    const configPath = writeConfig(tempDir, {
      ...validMultiConfig,
      defaultNamespace: "1default",
    });

    expect(() => loadConfig(configPath)).toThrow(
      'defaultNamespace: Invalid namespace name "1default"'
    );
  });

  it("accepts deliveryOutput for custom json artifact directory", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-config-"));
    const configPath = writeConfig(tempDir, {
      ...validMultiConfig,
      deliveryOutput: "public/i18n",
    });

    expect(loadConfig(configPath)).toMatchObject({
      deliveryOutput: "public/i18n",
      delivery: "canonical",
    });
  });

  it("resolveDeliveryOutputDir defaults to dirname(typesOutput)", () => {
    expect(
      resolveDeliveryOutputDir({
        typesOutput: "generated/i18n-types.generated.ts",
      })
    ).toBe("generated");
    expect(
      resolveDeliveryOutputDir({
        typesOutput: "generated/i18n-types.generated.ts",
        deliveryOutput: "public/i18n",
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

  it("throws when loadOnInit is set for split-by-locale delivery", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-config-"));
    const configPath = writeConfig(tempDir, {
      ...validMultiConfig,
      delivery: "split-by-locale",
      loadOnInit: ["default"],
    });

    expect(() => loadConfig(configPath)).toThrow(
      'loadOnInit is only allowed when delivery is "canonical".'
    );
  });

  it("throws when loadOnInit is set for custom delivery", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-config-"));
    const configPath = writeConfig(tempDir, {
      ...validMultiConfig,
      delivery: "custom",
      deliveryArtifacts: {
        eu: ["it"],
      },
      loadOnInit: ["default"],
    });

    expect(() => loadConfig(configPath)).toThrow(
      'loadOnInit is only allowed when delivery is "canonical".'
    );
  });
});

describe("resolveLoadOnInit", () => {
  const entries = [
    { namespace: "default", filePath: "translations/default.json" },
    { namespace: "billing", filePath: "translations/billing.json" },
  ];

  it("throws when loadOnInit is used in single mode", () => {
    const config = { ...validMultiConfig, delivery: "canonical" as const, loadOnInit: ["default"] };

    expect(() => resolveLoadOnInit(config, entries, true)).toThrow(
      '[Codegen Error] "loadOnInit" is only supported in multi mode (namespaces config).'
    );
  });

  it("throws when loadOnInit references an unknown namespace", () => {
    const config = { ...validMultiConfig, delivery: "canonical" as const, loadOnInit: ["missing"] };

    expect(() => resolveLoadOnInit(config, entries, false)).toThrow(
      '[Codegen Error] loadOnInit: namespace "missing" is not defined in namespaces config.'
    );
  });

  it("treats all namespaces as lazy when delivery is split-by-locale", () => {
    const config = { ...validMultiConfig, delivery: "split-by-locale" as const };

    expect(resolveLoadOnInit(config, entries, false)).toEqual({
      loadOnInitSet: new Set(),
      lazyEntries: entries,
      hasLazy: true,
    });
  });

  it("treats all namespaces as lazy when delivery is custom", () => {
    const config = { ...validMultiConfig, delivery: "custom" as const };

    expect(resolveLoadOnInit(config, entries, false)).toEqual({
      loadOnInitSet: new Set(),
      lazyEntries: entries,
      hasLazy: true,
    });
  });
});

describe("resolveImportExtension", () => {
  it("throws on unsupported import extensions", () => {
    expect(() => resolveImportExtension({ importExtension: ".mjs" as never })).toThrow(
      '[Codegen Error] importExtension must be "none", ".ts", or ".js", got ".mjs".'
    );
  });
});
