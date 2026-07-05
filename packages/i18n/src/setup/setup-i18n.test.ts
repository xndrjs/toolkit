import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { buildCodegenConfig, parseSetupArgs, runSetup } from "./setup-i18n.js";
import { inferProjectName, typeNamesForProject } from "./type-names.js";

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

  it("parses single and multi CLI args", () => {
    expect(parseSetupArgs(["single", ".", "--project", "MyApp"])).toEqual({
      mode: "single",
      targetDir: ".",
      project: "MyApp",
      force: false,
    });
    expect(parseSetupArgs(["multi", "apps/myapp", "--project", "MyApp", "--force"])).toEqual({
      mode: "multi",
      targetDir: "apps/myapp",
      project: "MyApp",
      force: true,
    });
  });

  it("scaffolds single mode with MyApp type names", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-setup-"));
    const result = runSetup({ mode: "single", targetDir: tempDir, project: "MyApp" });

    const config = JSON.parse(readFileSync(join(tempDir, "i18n/i18n.codegen.json"), "utf8"));
    expect(config.dictionary).toBe("translations/translations.json");
    expect(config.paramsTypeName).toBe("MyAppParams");
    expect(config.schemaTypeName).toBe("MyAppSchema");
    expect(config.localeTypeName).toBe("MyAppLocale");
    expect(existsSync(join(tempDir, "i18n/translations/translations.json"))).toBe(true);
    expect(existsSync(join(tempDir, "i18n/index.ts"))).toBe(true);
    expect(existsSync(join(tempDir, "src"))).toBe(false);
    expect(result.created).toContain("i18n/i18n.codegen.json");
  });

  it("scaffolds multi mode with default namespace only", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-setup-"));
    runSetup({ mode: "multi", targetDir: tempDir, project: "MyApp" });

    const config = JSON.parse(readFileSync(join(tempDir, "i18n/i18n.codegen.json"), "utf8"));
    expect(config.namespaces).toEqual({
      default: "translations/default.json",
    });
    expect(existsSync(join(tempDir, "i18n/translations/default.json"))).toBe(true);
  });

  it("scaffolds under src/i18n when targetDir is src", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-setup-"));
    const srcDir = join(tempDir, "src");
    runSetup({ mode: "single", targetDir: srcDir, project: "MyApp" });

    expect(existsSync(join(srcDir, "i18n/i18n.codegen.json"))).toBe(true);
    expect(existsSync(join(tempDir, "i18n"))).toBe(false);
  });

  it("refuses to overwrite an existing config without --force", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-setup-"));
    runSetup({ mode: "single", targetDir: tempDir, project: "MyApp" });

    expect(() => runSetup({ mode: "single", targetDir: tempDir, project: "MyApp" })).toThrow(
      "already exists"
    );
  });

  it("buildCodegenConfig omits lazy and validation keys by default", () => {
    expect(buildCodegenConfig("multi", "MyApp")).not.toHaveProperty("loadOnInit");
    expect(buildCodegenConfig("multi", "MyApp")).not.toHaveProperty("dictionarySchemaOutput");
  });
});
