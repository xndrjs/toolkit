import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import {
  getDictionaryFormat,
  prepareDictionaryEntries,
  readDictionaryFile,
  resolveCompiledJsonPath,
} from "./read-dictionary.js";

describe("read-dictionary", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("detects dictionary formats from file extension", () => {
    expect(getDictionaryFormat("translations/default.json")).toBe("json");
    expect(getDictionaryFormat("translations/default.yaml")).toBe("yaml");
    expect(getDictionaryFormat("translations/default.yml")).toBe("yaml");
    expect(getDictionaryFormat("translations/default.toml")).toBeNull();
  });

  it("resolves compiled json path under the generated output directory", () => {
    expect(
      resolveCompiledJsonPath("src/i18n/translations/billing.yaml", "src/i18n/generated")
    ).toBe("src/i18n/generated/translations/billing.json");
    expect(resolveCompiledJsonPath("translations/billing.yml", "generated")).toBe(
      "generated/translations/billing.json"
    );
  });

  it("reads multiline yaml dictionaries", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-read-dict-"));
    const yamlPath = join(tempDir, "welcome.yaml");
    writeFileSync(
      yamlPath,
      `welcome:
  en: |
    Line one
    Line two
  it: Ciao {name}
`
    );

    const dictionary = readDictionaryFile(yamlPath);
    expect(dictionary.welcome?.en).toBe("Line one\nLine two\n");
    expect(dictionary.welcome?.it).toBe("Ciao {name}");
  });

  it("compiles yaml sources to json under the generated output directory", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-read-dict-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });
    mkdirSync(join(tempDir, "src/i18n/generated"), { recursive: true });
    writeFileSync(
      join(tempDir, "src/i18n/translations/billing.yaml"),
      `invoice_summary:
  en: You have {count} invoices
`
    );

    const result = prepareDictionaryEntries(
      tempDir,
      [{ namespace: "billing", filePath: "src/i18n/translations/billing.yaml" }],
      "src/i18n/generated"
    );

    expect(result.resolvedEntries).toEqual([
      { namespace: "billing", filePath: "src/i18n/generated/translations/billing.json" },
    ]);
    expect(result.compiledFiles).toEqual([
      "src/i18n/translations/billing.yaml → src/i18n/generated/translations/billing.json",
    ]);

    const compiled = JSON.parse(
      readFileSync(join(tempDir, "src/i18n/generated/translations/billing.json"), "utf8")
    ) as Record<string, Record<string, string>>;
    expect(compiled.invoice_summary?.en).toBe("You have {count} invoices");
  });

  it("keeps json sources unchanged", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-read-dict-"));
    mkdirSync(join(tempDir, "translations"), { recursive: true });
    writeFileSync(
      join(tempDir, "translations/default.json"),
      JSON.stringify({ welcome: { en: "Welcome {name}!" } })
    );

    const result = prepareDictionaryEntries(
      tempDir,
      [{ namespace: "default", filePath: "translations/default.json" }],
      "generated"
    );

    expect(result.resolvedEntries).toEqual([
      { namespace: "default", filePath: "translations/default.json" },
    ]);
    expect(result.compiledFiles).toEqual([]);
  });
});
