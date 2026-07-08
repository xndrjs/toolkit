import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CODEGEN_CONFIG_KEYS } from "./codegen-config-schema.js";
import { loadConfig } from "./config.js";

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

    expect(loadConfig(configPath)).toEqual(validMultiConfig);
  });

  it("fails on unknown top-level keys and reports allowed keys", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-config-"));
    const configPath = writeConfig(tempDir, {
      ...validMultiConfig,
      typoKey: true,
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as typeof process.exit);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => void 0);

    expect(() => loadConfig(configPath)).toThrow("process.exit");
    expect(errorSpy).toHaveBeenCalled();

    const message = String(errorSpy.mock.calls[0]?.[0]);
    expect(message).toContain("Invalid i18n.codegen.json");
    expect(message).toContain("typoKey");
    expect(message).toContain(`Allowed keys: ${CODEGEN_CONFIG_KEYS.join(", ")}`);

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("fails when both dictionary and namespaces are present", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-config-"));
    const configPath = writeConfig(tempDir, {
      ...validMultiConfig,
      dictionary: "translations/default.json",
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as typeof process.exit);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => void 0);

    expect(() => loadConfig(configPath)).toThrow("process.exit");

    const message = String(errorSpy.mock.calls[0]?.[0]);
    expect(message).toContain('Specify exactly one of "dictionary" or "namespaces".');

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("fails when required fields are missing", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-config-"));
    const configPath = writeConfig(tempDir, {
      namespaces: validMultiConfig.namespaces,
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as typeof process.exit);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => void 0);

    expect(() => loadConfig(configPath)).toThrow("process.exit");

    const message = String(errorSpy.mock.calls[0]?.[0]);
    expect(message).toContain("typesOutput");
    expect(message).toContain("Allowed keys:");

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
