import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { buildCodegenConfig, parseSetupArgs, runSetup } from "./setup-i18n.js";
import { inferProjectName, typeNamesForProject } from "../codegen-config/type-names.js";

describe("type-names", () => {
  it("derives PascalCase project names from directory names", () => {
    expect(inferProjectName("myapp")).toBe("Myapp");
    expect(inferProjectName("my-app")).toBe("MyApp");
    expect(inferProjectName("apps")).toBe("Apps");
  });

  it("builds type names from project prefix", () => {
    expect(typeNamesForProject("MyApp")).toEqual({
      paramsTypeName: "MyAppParams",
      schemaTypeName: "MyAppSchema",
      localeTypeName: "MyAppLocale",
    });
  });
});

describe("setup-i18n", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("accepts multi alias or positional targetDir", () => {
    expect(parseSetupArgs(["multi", "apps/myapp", "--project", "MyApp", "--force"])).toEqual({
      targetDir: "apps/myapp",
      project: "MyApp",
      force: true,
    });
    expect(parseSetupArgs([".", "--project", "MyApp"])).toEqual({
      targetDir: ".",
      project: "MyApp",
      force: false,
    });
  });

  it("scaffolds multi mode with projectName and codegenPath", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-setup-"));
    const result = runSetup({ targetDir: tempDir, project: "MyApp" });

    const config = JSON.parse(readFileSync(join(tempDir, "i18n/i18n.codegen.json"), "utf8"));
    expect(config.namespaces).toEqual({
      default: "translations/default.json",
    });
    expect(config.projectName).toBe("MyApp");
    expect(config.codegenPath).toBe("generated");
    expect(config).not.toHaveProperty("paramsTypeName");
    expect(existsSync(join(tempDir, "i18n/translations/default.json"))).toBe(true);
    expect(existsSync(join(tempDir, "i18n/index.ts"))).toBe(true);
    expect(existsSync(join(tempDir, "src"))).toBe(false);
    expect(result.created).toContain("i18n/i18n.codegen.json");
  });

  it("scaffolds under src/i18n when targetDir is src", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-setup-"));
    const srcDir = join(tempDir, "src");
    runSetup({ targetDir: srcDir, project: "MyApp" });

    expect(existsSync(join(srcDir, "i18n/i18n.codegen.json"))).toBe(true);
    expect(existsSync(join(tempDir, "i18n"))).toBe(false);
  });

  it("refuses to overwrite an existing config without --force", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-setup-"));
    runSetup({ targetDir: tempDir, project: "MyApp" });

    expect(() => runSetup({ targetDir: tempDir, project: "MyApp" })).toThrow("already exists");
  });

  it("buildCodegenConfig defaults to split-by-locale", () => {
    const config = buildCodegenConfig("MyApp");
    expect(config.delivery).toBe("split-by-locale");
    expect(config.codegenPath).toBe("generated");
    expect(config.projectName).toBe("MyApp");
  });
});
