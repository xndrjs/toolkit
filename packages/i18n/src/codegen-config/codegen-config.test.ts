import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { buildCodegenConfig, type CodegenConfigInput, writeCodegenConfig } from "./index.js";

describe("codegen-config", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("buildCodegenConfig returns a valid multi-namespace input shape", () => {
    const config = buildCodegenConfig("MyApp");
    expect(config.namespaces).toEqual({
      default: "translations/default.json",
    });
    expect(config.projectName).toBe("MyApp");
    expect(config.codegenPath).toBe("generated");
    expect(config).not.toHaveProperty("dictionary");
    expect(config).not.toHaveProperty("paramsTypeName");
  });

  it("writeCodegenConfig writes formatted JSON", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-config-"));
    const configPath = join(tempDir, "i18n/i18n.codegen.json");
    const config: CodegenConfigInput = buildCodegenConfig("Demo");

    writeCodegenConfig(configPath, config);

    expect(readFileSync(configPath, "utf8")).toBe(`${JSON.stringify(config, null, 2)}\n`);
  });
});
