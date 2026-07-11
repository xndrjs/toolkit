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

  it("buildCodegenConfig returns a valid single-mode input shape", () => {
    const config = buildCodegenConfig("single", "MyApp");
    expect(config.dictionary).toBe("translations/translations.json");
    expect(config.paramsTypeName).toBe("MyAppParams");
    expect(config).not.toHaveProperty("namespaces");
  });

  it("writeCodegenConfig writes formatted JSON", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-config-"));
    const configPath = join(tempDir, "i18n/i18n.codegen.json");
    const config: CodegenConfigInput = buildCodegenConfig("multi", "Demo");

    writeCodegenConfig(configPath, config);

    expect(readFileSync(configPath, "utf8")).toBe(`${JSON.stringify(config, null, 2)}\n`);
  });
});
