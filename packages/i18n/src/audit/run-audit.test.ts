import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAuditArgs, runAuditCli } from "./run-audit.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const auditBin = join(packageRoot, "bin/audit.mjs");

describe("parseAuditArgs", () => {
  it("defaults to report-only mode without --fail-on", () => {
    expect(parseAuditArgs([])).toEqual({
      configPath: join(process.cwd(), "i18n/i18n.codegen.json"),
      outPath: undefined,
      failOn: undefined,
      treatEmptyAsMissing: true,
    });
  });

  it("parses fail-on and allow-empty", () => {
    const parsed = parseAuditArgs([
      "--config",
      "cfg.json",
      "--fail-on",
      "effective",
      "--allow-empty",
    ]);
    expect(parsed.failOn).toBe("effective");
    expect(parsed.treatEmptyAsMissing).toBe(false);
    expect(parsed.configPath).toBe(join(process.cwd(), "cfg.json"));
  });
});

describe("runAuditCli", () => {
  let tempDir = "";

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
  });

  function writeFixture(dictionary: Record<string, Record<string, string>>) {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-audit-"));
    mkdirSync(join(tempDir, "i18n/translations"), { recursive: true });
    writeFileSync(join(tempDir, "i18n/translations/translations.json"), JSON.stringify(dictionary));
    writeFileSync(
      join(tempDir, "i18n/i18n.codegen.json"),
      JSON.stringify({
        dictionary: "translations/translations.json",
        typesOutput: "generated/i18n-types.generated.ts",
        dictionaryOutput: "generated/dictionary.generated.ts",
        instanceOutput: "generated/instance.generated.ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
        localeFallback: {
          en: null,
          it: "en",
        },
      })
    );
  }

  it("exits 0 without --fail-on even when effective gaps exist", async () => {
    writeFixture({
      welcome: { en: "Welcome" },
    });

    const previousCwd = process.cwd();
    process.chdir(tempDir);
    try {
      const exitCode = await runAuditCli(["--config", "i18n/i18n.codegen.json"]);
      expect(exitCode).toBe(0);
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("exits 1 with --fail-on effective when effective gaps exist", async () => {
    writeFixture({
      login_button: { it: "Accedi" },
    });

    const previousCwd = process.cwd();
    process.chdir(tempDir);
    try {
      const exitCode = await runAuditCli([
        "--config",
        "i18n/i18n.codegen.json",
        "--fail-on",
        "effective",
      ]);
      expect(exitCode).toBe(1);
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("writes JSON report to --out", async () => {
    writeFixture({
      login_button: { en: "Login", it: "Accedi" },
    });

    const outPath = join(tempDir, "audit.json");
    const previousCwd = process.cwd();
    process.chdir(tempDir);
    try {
      const exitCode = await runAuditCli(["--config", "i18n/i18n.codegen.json", "--out", outPath]);
      expect(exitCode).toBe(0);
      const report = JSON.parse(readFileSync(outPath, "utf8"));
      expect(report.requiredLocales).toEqual(["en", "it"]);
      expect(report.missingEffectiveByLocale.default.en).toEqual([]);
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("exits 2 with an error message when the config is invalid", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-audit-"));
    mkdirSync(join(tempDir, "i18n"), { recursive: true });
    writeFileSync(
      join(tempDir, "i18n/i18n.codegen.json"),
      JSON.stringify({ namespaces: { default: "translations/default.json" } })
    );

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => void 0);
    const previousCwd = process.cwd();
    process.chdir(tempDir);
    try {
      const exitCode = await runAuditCli(["--config", "i18n/i18n.codegen.json"]);
      expect(exitCode).toBe(2);
      expect(String(errorSpy.mock.calls[0]?.[0])).toContain("Invalid i18n.codegen.json");
    } finally {
      process.chdir(previousCwd);
      errorSpy.mockRestore();
    }
  });

  it("exits 2 with an error message when --fail-on has an invalid value", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => void 0);
    try {
      const exitCode = await runAuditCli(["--fail-on", "bogus"]);
      expect(exitCode).toBe(2);
      expect(String(errorSpy.mock.calls[0]?.[0])).toContain(
        "[Audit Error] --fail-on must be one of: effective, direct, any"
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("runs through the bin wrapper", () => {
    writeFixture({
      login_button: { en: "Login" },
    });

    const result = spawnSync("node", [auditBin, "--config", "i18n/i18n.codegen.json"], {
      cwd: tempDir,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.requiredLocales).toEqual(["en", "it"]);
  });
});
