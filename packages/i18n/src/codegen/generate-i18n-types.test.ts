import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, afterEach } from "vitest";
import { spawnWithTsx } from "../test-utils/spawn-with-tsx.js";

const codegenScript = fileURLToPath(new URL("./generate-i18n-types.ts", import.meta.url));

function runCodegen(cwd: string, configFile = "i18n.codegen.json") {
  return spawnWithTsx(codegenScript, ["--config", configFile], {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
}

describe("generate-i18n-types", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("generates nested types for multi-namespace config", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/default.json"),
      JSON.stringify({
        login_button: { en: "Login" },
        welcome: { en: "Welcome {name}!" },
        inbox_owner: {
          en: "{gender, select, female {{name} owns her inbox} other {{name} owns their inbox}}",
        },
        account_balance: { en: "Balance: {amount, number, ::currency/EUR}" },
        appointment_summary: {
          en: "Due {dueDate, date, short} at {startTime, time, short}",
        },
      })
    );
    writeFileSync(
      join(tempDir, "src/i18n/translations/billing.json"),
      JSON.stringify({
        invoice_summary: {
          en: "You have {count, plural, one {1 invoice} other {{count} invoices}}",
        },
      })
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        namespaces: {
          default: "src/i18n/translations/default.json",
          billing: "src/i18n/translations/billing.json",
        },
        projectName: "App",
        codegenPath: "src/i18n",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).toBe(0);

    const types = readFileSync(join(tempDir, "src/i18n/i18n-types.generated.ts"), "utf8");
    const factory = readFileSync(join(tempDir, "src/i18n/instance.generated.ts"), "utf8");
    expect(types).toContain("export const I18N_MODE = 'multi' as const");
    expect(types).toContain('export const AppLocales = ["en"] as const;');
    expect(types).toContain("export type AppLocale = (typeof AppLocales)[number];");
    expect(factory).toContain("export function createI18n(");
    expect(factory).toContain("onMissing?: OnMissingTranslation");
    expect(factory).toContain("state?: { dictionary: InitialSchema");
    expect(factory).toContain("IcuTranslationProviderMulti");
    expect(types).toContain("login_button: never");
    expect(types).toContain("welcome: { name: string }");
    expect(types).toContain("inbox_owner: { gender: string; name: string }");
    expect(types).toContain("account_balance: { amount: number }");
    expect(types).toContain(
      "appointment_summary: { dueDate: Date | number; startTime: Date | number }"
    );
    expect(types).toContain("invoice_summary: { count: number }");
    expect(types).toContain("export type AppParams");
    expect(types).toContain("export type AppSchema");
  });

  it("does not rewrite unchanged generated files on rerun", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/translations.json"),
      JSON.stringify({ welcome: { en: "Welcome {name}!" } })
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        namespaces: {
          default: "src/i18n/translations/translations.json",
        },
        projectName: "App",
        codegenPath: "src/i18n",
      })
    );

    expect(runCodegen(tempDir).status).toBe(0);

    const generatedPaths = [
      join(tempDir, "src/i18n/i18n-types.generated.ts"),
      join(tempDir, "src/i18n/instance.generated.ts"),
      join(tempDir, "src/i18n/namespace-loaders.generated.ts"),
    ];
    const mtimesBefore = generatedPaths.map((filePath) => statSync(filePath).mtimeMs);

    expect(runCodegen(tempDir).status).toBe(0);

    const mtimesAfter = generatedPaths.map((filePath) => statSync(filePath).mtimeMs);
    expect(mtimesAfter).toEqual(mtimesBefore);
  });

  it("always generates dictionary schema file under codegenPath", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/default.json"),
      JSON.stringify({
        welcome: { en: "Welcome {name}!" },
      })
    );
    writeFileSync(
      join(tempDir, "src/i18n/translations/billing.json"),
      JSON.stringify({
        invoice_summary: {
          en: "You have {count, plural, one {1 invoice} other {{count} invoices}}",
        },
      })
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        namespaces: {
          default: "src/i18n/translations/default.json",
          billing: "src/i18n/translations/billing.json",
        },
        projectName: "App",
        codegenPath: "src/i18n",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).toBe(0);

    const schema = readFileSync(join(tempDir, "src/i18n/dictionary-schema.generated.ts"), "utf8");
    expect(schema).toContain("export const DICTIONARY_SPEC");
    expect(schema).toContain("mode: 'multi' as const");
    expect(schema).toContain("validateExternalDictionaryPartial");
    expect(schema).toContain("validateExternalNamespacePartial");
    expect(schema).toContain("validateExternalKey");
    expect(schema).toContain('"name": "string"');
  });

  it("generates multi-mode dictionary schema with namespace validator", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/default.json"),
      JSON.stringify({
        welcome: { en: "Welcome {name}!" },
      })
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        namespaces: {
          default: "src/i18n/translations/default.json",
        },
        projectName: "App",
        codegenPath: "src/i18n",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).toBe(0);

    const schema = readFileSync(join(tempDir, "src/i18n/dictionary-schema.generated.ts"), "utf8");
    expect(schema).toContain("mode: 'multi' as const");
    expect(schema).toContain("validateExternalDictionaryPartial");
    expect(schema).toContain("validateExternalNamespacePartial");
    expect(schema).toContain("validateExternalKey");
  });

  it("fails with a non-zero exit code on malformed ICU", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/translations.json"),
      JSON.stringify({
        broken: { en: "Hello {{name}}" },
      })
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        namespaces: {
          default: "src/i18n/translations/translations.json",
        },
        projectName: "App",
        codegenPath: "src/i18n",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("MALFORMED_ARGUMENT");
  });

  it("generates locale fallback constants and wires them into the factory", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/translations.json"),
      JSON.stringify({
        login_button: { en: "Login" },
      })
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        namespaces: {
          default: "src/i18n/translations/translations.json",
        },
        projectName: "App",
        codegenPath: "src/i18n",
        localeFallback: {
          en: null,
          "de-CH": "en",
        },
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).toBe(0);

    const types = readFileSync(join(tempDir, "src/i18n/i18n-types.generated.ts"), "utf8");
    const factory = readFileSync(join(tempDir, "src/i18n/instance.generated.ts"), "utf8");
    expect(types).toContain("export const LOCALE_FALLBACK");
    expect(types).toContain('"de-CH": "en"');
    expect(types).toContain('export const AppLocales = ["de-CH", "en"] as const;');
    expect(types).toContain("export type AppLocale = (typeof AppLocales)[number];");
    expect(factory).toContain("localeFallback: LOCALE_FALLBACK");
    expect(factory).toContain("...providerOptions");
    expect(factory).toContain(
      "IcuTranslationProviderMulti<AppSchema, AppParams, AppLocale, typeof LOCALE_FALLBACK>"
    );
  });

  it("enriches LOCALE_FALLBACK with null for dictionary locales missing from config", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/translations.json"),
      JSON.stringify({
        login_button: { en: "Login", fr: "Connexion" },
      })
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        namespaces: {
          default: "src/i18n/translations/translations.json",
        },
        projectName: "App",
        codegenPath: "src/i18n",
        localeFallback: {
          en: null,
          it: "en",
        },
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).toBe(0);

    const types = readFileSync(join(tempDir, "src/i18n/i18n-types.generated.ts"), "utf8");
    expect(types).toContain('"fr": null');
    expect(types).toContain('"it": "en"');
    expect(types).toContain('export const AppLocales = ["en", "fr", "it"] as const;');
    expect(types).toContain("export type AppLocale = (typeof AppLocales)[number];");
  });

  it("does not emit LOCALE_FALLBACK when localeFallback is absent from config", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/translations.json"),
      JSON.stringify({
        login_button: { en: "Login", it: "Accedi" },
      })
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        namespaces: {
          default: "src/i18n/translations/translations.json",
        },
        projectName: "App",
        codegenPath: "src/i18n",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).toBe(0);

    const types = readFileSync(join(tempDir, "src/i18n/i18n-types.generated.ts"), "utf8");
    expect(types).toContain('export const AppLocales = ["en", "it"] as const;');
    expect(types).toContain("export type AppLocale = (typeof AppLocales)[number];");
  });

  it("fails on circular locale fallback in config", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/translations.json"),
      JSON.stringify({
        login_button: { en: "Login" },
      })
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        namespaces: {
          default: "src/i18n/translations/translations.json",
        },
        projectName: "App",
        codegenPath: "src/i18n",
        localeFallback: {
          a: "b",
          b: "a",
        },
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Circular locale fallback");
  });

  it("generates namespace loaders for all namespaces under split-by-locale", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/default.json"),
      JSON.stringify({
        welcome: { en: "Welcome {name}!" },
      })
    );
    writeFileSync(
      join(tempDir, "src/i18n/translations/billing.json"),
      JSON.stringify({
        invoice_summary: {
          en: "You have {count, plural, one {1 invoice} other {{count} invoices}}",
        },
      })
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        namespaces: {
          default: "src/i18n/translations/default.json",
          billing: "src/i18n/translations/billing.json",
        },
        projectName: "App",
        codegenPath: "src/i18n",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).toBe(0);

    const types = readFileSync(join(tempDir, "src/i18n/i18n-types.generated.ts"), "utf8");
    const factory = readFileSync(join(tempDir, "src/i18n/instance.generated.ts"), "utf8");
    const loaders = readFileSync(join(tempDir, "src/i18n/namespace-loaders.generated.ts"), "utf8");

    expect(types).toContain("export type LazyNamespace = 'default' | 'billing'");
    expect(types).toContain("export type InitialSchema = Record<string, never>");
    expect(factory).toContain(
      "state?: { dictionary: InitialSchema; resources?: readonly (readonly [string, string])[] }"
    );
    expect(factory).toContain("normalizeI18nCreateInput");
    expect(factory).toContain("seedBuilderResources");
    expect(loaders).toContain("export const namespaceLoaders");
    expect(loaders).toContain(
      "[K in LazyNamespace]: (locale: AppLocale) => Promise<AppSchema[K]>;"
    );
    expect(loaders).toContain(
      "return import('./translations/billing.en.json').then((m) => m.default);"
    );
  });

  it("infers number when English plural and Italian simple interpolation share a key", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/translations.json"),
      JSON.stringify({
        invoice_count: {
          en: "You have {count, plural, one {1 invoice} other {# invoices}}",
          it: "Hai {count} fatture",
        },
      })
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        namespaces: {
          default: "src/i18n/translations/translations.json",
        },
        projectName: "App",
        codegenPath: "src/i18n",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).toBe(0);

    const types = readFileSync(join(tempDir, "src/i18n/i18n-types.generated.ts"), "utf8");
    expect(types).toContain("invoice_count: { count: number }");
  });

  it("fails when plural and select disagree on the same variable across locales", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/translations.json"),
      JSON.stringify({
        broken: {
          en: "{myVar, select, other {x}}",
          it: "{myVar, plural, one {1} other {#}}",
        },
      })
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        namespaces: {
          default: "src/i18n/translations/translations.json",
        },
        projectName: "App",
        codegenPath: "src/i18n",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Incompatible ICU variable "myVar"');
  });

  it("fails when plural and selectordinal disagree on the same variable across locales", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/translations.json"),
      JSON.stringify({
        broken: {
          en: "{rank, plural, one {1} other {#}}",
          it: "{rank, selectordinal, one {#°} other {#°}}",
        },
      })
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        namespaces: {
          default: "src/i18n/translations/translations.json",
        },
        projectName: "App",
        codegenPath: "src/i18n",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Incompatible ICU variable "rank"');
  });

  it("fails when select and number format disagree on the same variable across locales", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/translations.json"),
      JSON.stringify({
        broken: {
          en: "{value, select, other {x}}",
          it: "{value, number}",
        },
      })
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        namespaces: {
          default: "src/i18n/translations/translations.json",
        },
        projectName: "App",
        codegenPath: "src/i18n",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Incompatible ICU variable "value"');
  });

  it("keeps multi mode when namespaces has a single entry", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/default.json"),
      JSON.stringify({ welcome: { en: "Welcome {name}!" } })
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        namespaces: {
          default: "src/i18n/translations/default.json",
        },
        projectName: "App",
        codegenPath: "src/i18n",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).toBe(0);

    const types = readFileSync(join(tempDir, "src/i18n/i18n-types.generated.ts"), "utf8");
    const factory = readFileSync(join(tempDir, "src/i18n/instance.generated.ts"), "utf8");
    expect(types).toContain("export const I18N_MODE = 'multi' as const");
    expect(types).toContain("default: {");
    expect(factory).toContain("IcuTranslationProviderMulti");
  });

  it("omits import extension by default between generated modules", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/translations.json"),
      JSON.stringify({ welcome: { en: "Welcome {name}!" } })
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        namespaces: {
          default: "src/i18n/translations/translations.json",
        },
        projectName: "App",
        codegenPath: "src/i18n",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).toBe(0);

    const factory = readFileSync(join(tempDir, "src/i18n/instance.generated.ts"), "utf8");
    const loaders = readFileSync(join(tempDir, "src/i18n/namespace-loaders.generated.ts"), "utf8");
    expect(factory).toContain("from './i18n-types.generated'");
    expect(factory).toContain("dictionary: InitialSchema");
    expect(loaders).toContain("from './i18n-types.generated'");
  });

  it("compiles yaml dictionaries to json and generates json imports", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });
    mkdirSync(join(tempDir, "src/i18n/generated"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/translations.yaml"),
      `welcome:
  en: |
    Line one
    Line two
  it: |
    Riga uno
    Riga due
`
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        namespaces: {
          default: "src/i18n/translations/translations.yaml",
        },
        projectName: "App",
        codegenPath: "src/i18n/generated",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "Compiled: src/i18n/translations/translations.yaml → src/i18n/generated/translations/translations.en.json"
    );

    const compiled = JSON.parse(
      readFileSync(join(tempDir, "src/i18n/generated/translations/translations.en.json"), "utf8")
    ) as Record<string, Record<string, string>>;
    expect(compiled.welcome?.en).toBe("Line one\nLine two\n");

    const types = readFileSync(join(tempDir, "src/i18n/generated/i18n-types.generated.ts"), "utf8");
    const loaders = readFileSync(
      join(tempDir, "src/i18n/generated/namespace-loaders.generated.ts"),
      "utf8"
    );
    expect(types).toContain("welcome: Partial<Record<AppLocale, string>>;");
    expect(loaders).toContain(
      "return import('./translations/translations.en.json').then((m) => m.default);"
    );
  });

  it("supports mixed json and yaml namespaces", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });
    mkdirSync(join(tempDir, "src/i18n/generated"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/default.json"),
      JSON.stringify({
        login_button: { en: "Login", it: "Accedi" },
      })
    );
    writeFileSync(
      join(tempDir, "src/i18n/translations/billing.yaml"),
      `invoice_summary:
  en: You have {count} invoices
`
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        namespaces: {
          default: "src/i18n/translations/default.json",
          billing: "src/i18n/translations/billing.yaml",
        },
        projectName: "App",
        codegenPath: "src/i18n/generated",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).toBe(0);

    const types = readFileSync(join(tempDir, "src/i18n/generated/i18n-types.generated.ts"), "utf8");
    const loaders = readFileSync(
      join(tempDir, "src/i18n/generated/namespace-loaders.generated.ts"),
      "utf8"
    );
    expect(types).toContain("login_button: Partial<Record<AppLocale, string>>;");
    expect(types).toContain("invoice_summary: Partial<Record<AppLocale, string>>;");
    expect(loaders).toContain(
      "return import('./translations/billing.en.json').then((m) => m.default);"
    );
    expect(loaders).toContain(
      "return import('./translations/default.en.json').then((m) => m.default);"
    );
  });

  it("generates lazy loaders that import compiled json for yaml namespaces", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });
    mkdirSync(join(tempDir, "src/i18n/generated"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/default.json"),
      JSON.stringify({
        login_button: { en: "Login" },
      })
    );
    writeFileSync(
      join(tempDir, "src/i18n/translations/billing.yaml"),
      `invoice_summary:
  en: You have {count} invoices
`
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        namespaces: {
          default: "src/i18n/translations/default.json",
          billing: "src/i18n/translations/billing.yaml",
        },
        projectName: "App",
        codegenPath: "src/i18n/generated",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).toBe(0);

    const loaders = readFileSync(
      join(tempDir, "src/i18n/generated/namespace-loaders.generated.ts"),
      "utf8"
    );
    expect(loaders).toContain(
      "return import('./translations/billing.en.json').then((m) => m.default);"
    );
  });

  it("fails when dictionary extension is unsupported", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });

    writeFileSync(join(tempDir, "src/i18n/translations/translations.toml"), "welcome = {}");
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        namespaces: {
          default: "src/i18n/translations/translations.toml",
        },
        projectName: "App",
        codegenPath: "src/i18n",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/unsupported dictionary (extension|format)/i);
  });

  it("generates split-by-locale delivery with per-locale files and namespace loaders", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });
    mkdirSync(join(tempDir, "src/i18n/generated"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/default.json"),
      JSON.stringify({
        welcome: { en: "Welcome {name}!", it: "Benvenuto {name}!" },
      })
    );
    writeFileSync(
      join(tempDir, "src/i18n/translations/user.json"),
      JSON.stringify({
        profile_title: { en: "Your profile", it: "Il tuo profilo" },
      })
    );
    writeFileSync(
      join(tempDir, "src/i18n/translations/billing.json"),
      JSON.stringify({
        invoice_summary: {
          en: "You have {count, plural, one {1 invoice} other {{count} invoices}}",
          it: "Hai {count} fatture",
        },
      })
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        namespaces: {
          default: "src/i18n/translations/default.json",
          user: "src/i18n/translations/user.json",
          billing: "src/i18n/translations/billing.json",
        },
        delivery: "split-by-locale",
        projectName: "App",
        codegenPath: "src/i18n/generated",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("default.en.json");
    expect(result.stdout).toContain("user.it.json");
    expect(result.stdout).toContain("billing.en.json");

    const userEn = JSON.parse(
      readFileSync(join(tempDir, "src/i18n/generated/translations/user.en.json"), "utf8")
    ) as Record<string, Record<string, string>>;
    expect(userEn.profile_title).toEqual({ en: "Your profile" });

    const billingIt = JSON.parse(
      readFileSync(join(tempDir, "src/i18n/generated/translations/billing.it.json"), "utf8")
    ) as Record<string, Record<string, string>>;
    expect(billingIt.invoice_summary).toEqual({ it: "Hai {count} fatture" });

    expect(() =>
      readFileSync(join(tempDir, "src/i18n/generated/translations/billing.json"), "utf8")
    ).toThrow();

    const types = readFileSync(join(tempDir, "src/i18n/generated/i18n-types.generated.ts"), "utf8");
    const loaders = readFileSync(
      join(tempDir, "src/i18n/generated/namespace-loaders.generated.ts"),
      "utf8"
    );

    expect(types).toContain("welcome: Partial<Record<AppLocale, string>>;");
    expect(types).toContain("invoice_summary: Partial<Record<AppLocale, string>>;");
    expect(types).toContain('export const AppLocales = ["en", "it"] as const;');
    expect(types).toContain("export type AppLocale = (typeof AppLocales)[number];");
    expect(types).toContain("invoice_summary: { count: number }");

    expect(types).toContain("export type LazyNamespace = 'default' | 'user' | 'billing';");

    expect(loaders).toContain(
      "[K in LazyNamespace]: (locale: AppLocale) => Promise<AppSchema[K]>;"
    );
    expect(loaders).toContain("export const defaultLazyNamespaces");
    expect(loaders).toContain("default: (locale) => {");
    expect(loaders).toContain("billing: (locale) => {");
    expect(loaders).toContain('case "it":');
    expect(loaders).toContain(
      "return import('./translations/billing.it.json').then((m) => m.default);"
    );
    expect(loaders).toContain('case "en":');
    expect(loaders).toContain(
      "return import('./translations/billing.en.json').then((m) => m.default);"
    );
    expect(loaders).toContain("user: (locale) => {");
  });

  it("writes delivery json under artifactsPath when it differs from codegenPath", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });
    mkdirSync(join(tempDir, "src/i18n/generated"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/default.json"),
      JSON.stringify({
        welcome: { en: "Welcome {name}!", it: "Benvenuto {name}!" },
      })
    );
    writeFileSync(
      join(tempDir, "src/i18n/translations/billing.yaml"),
      `invoice_summary:
  en: You have {count} invoices
  it: Hai {count} fatture
`
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        namespaces: {
          default: "src/i18n/translations/default.json",
          billing: "src/i18n/translations/billing.yaml",
        },
        delivery: "split-by-locale",
        artifactsPath: "public/i18n",
        projectName: "App",
        codegenPath: "src/i18n/generated",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("public/i18n/translations/billing.en.json");
    expect(result.stdout).toContain("public/i18n/translations/billing.it.json");

    expect(() =>
      readFileSync(join(tempDir, "src/i18n/generated/translations/billing.en.json"), "utf8")
    ).toThrow();

    const billingEn = JSON.parse(
      readFileSync(join(tempDir, "public/i18n/translations/billing.en.json"), "utf8")
    ) as Record<string, Record<string, string>>;
    expect(billingEn.invoice_summary).toEqual({ en: "You have {count} invoices" });

    const loaders = readFileSync(
      join(tempDir, "src/i18n/generated/namespace-loaders.generated.ts"),
      "utf8"
    );
    expect(loaders).toContain("export const defaultLazyNamespaces");
    expect(loaders).toContain(
      "return import('../../../public/i18n/translations/default.en.json').then((m) => m.default);"
    );
    expect(loaders).toContain(
      "return import('../../../public/i18n/translations/billing.en.json').then((m) => m.default);"
    );
    expect(loaders).toContain(
      "return import('../../../public/i18n/translations/billing.it.json').then((m) => m.default);"
    );
  });

  it("applies localeFallback when generating split-by-locale files", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });
    mkdirSync(join(tempDir, "src/i18n/generated"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/default.json"),
      JSON.stringify({
        login_button: { en: "Login", it: "Accedi" },
      })
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        namespaces: {
          default: "src/i18n/translations/default.json",
        },
        delivery: "split-by-locale",
        localeFallback: {
          en: null,
          "de-DE": "en",
          "de-CH": "de-DE",
          it: "en",
        },
        projectName: "App",
        codegenPath: "src/i18n/generated",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("default.de-CH.json");

    const deChSplit = JSON.parse(
      readFileSync(join(tempDir, "src/i18n/generated/translations/default.de-CH.json"), "utf8")
    ) as Record<string, Record<string, string>>;
    expect(deChSplit).toEqual({
      login_button: { "de-CH": "Login" },
    });

    const types = readFileSync(join(tempDir, "src/i18n/generated/i18n-types.generated.ts"), "utf8");
    expect(types).toContain('export const AppLocales = ["de-CH", "de-DE", "en", "it"] as const;');
    expect(types).toContain("export type AppLocale = (typeof AppLocales)[number];");
  });

  it("generates custom delivery with per-area json files", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });
    mkdirSync(join(tempDir, "src/i18n/generated"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/default.json"),
      JSON.stringify({
        some_key: { it: "Ciao", fr: "Hallo", "en-US": "Hello" },
        some_other_key: { "en-US": "Computer", fr: "Ordinateur" },
      })
    );
    writeFileSync(
      join(tempDir, "src/i18n/translations/billing.json"),
      JSON.stringify({
        invoice_summary: {
          "en-US": "You have {count, plural, one {1 invoice} other {{count} invoices}}",
          it: "Hai {count} fatture",
        },
      })
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        namespaces: {
          default: "src/i18n/translations/default.json",
          billing: "src/i18n/translations/billing.json",
        },
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
        projectName: "App",
        codegenPath: "src/i18n/generated",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("default.eu.json");
    expect(result.stdout).toContain("default.us.json");
    expect(result.stdout).toContain("billing.eu.json");
    expect(result.stdout).toContain("billing.us.json");

    const defaultEu = JSON.parse(
      readFileSync(join(tempDir, "src/i18n/generated/translations/default.eu.json"), "utf8")
    ) as Record<string, Record<string, string>>;
    expect(defaultEu).toEqual({
      some_key: { it: "Ciao", fr: "Hallo" },
      some_other_key: { it: "Computer", fr: "Ordinateur" },
    });

    const defaultUs = JSON.parse(
      readFileSync(join(tempDir, "src/i18n/generated/translations/default.us.json"), "utf8")
    ) as Record<string, Record<string, string>>;
    expect(defaultUs).toEqual({
      some_key: { "en-US": "Hello" },
      some_other_key: { "en-US": "Computer" },
    });

    expect(() =>
      readFileSync(join(tempDir, "src/i18n/generated/translations/default.json"), "utf8")
    ).toThrow();

    const types = readFileSync(join(tempDir, "src/i18n/generated/i18n-types.generated.ts"), "utf8");
    const loaders = readFileSync(
      join(tempDir, "src/i18n/generated/namespace-loaders.generated.ts"),
      "utf8"
    );
    const factory = readFileSync(join(tempDir, "src/i18n/generated/instance.generated.ts"), "utf8");

    const billingEu = JSON.parse(
      readFileSync(join(tempDir, "src/i18n/generated/translations/billing.eu.json"), "utf8")
    ) as Record<string, Record<string, string>>;
    expect(billingEu.invoice_summary).toEqual({ it: "Hai {count} fatture" });

    const billingUs = JSON.parse(
      readFileSync(join(tempDir, "src/i18n/generated/translations/billing.us.json"), "utf8")
    ) as Record<string, Record<string, string>>;
    expect(billingUs.invoice_summary).toEqual({
      "en-US": "You have {count, plural, one {1 invoice} other {{count} invoices}}",
    });

    expect(() =>
      readFileSync(join(tempDir, "src/i18n/generated/translations/billing.json"), "utf8")
    ).toThrow();

    expect(types).toContain('export const AppDeliveryAreas = ["eu", "us"] as const;');
    expect(types).toContain("export type AppDeliveryArea = (typeof AppDeliveryAreas)[number];");
    expect(types).toContain("export const DELIVERY_ARTIFACTS = {");
    expect(types).toContain('"eu": ["fr", "it"] as const');
    expect(types).toContain('"us": ["en-US"] as const');
    expect(types).toContain("} as const satisfies Record<AppDeliveryArea, readonly AppLocale[]>;");
    expect(types).toContain("export type AppDeliveryArtifacts = typeof DELIVERY_ARTIFACTS;");
    expect(types).toContain("export const LOCALE_DELIVERY_AREA = {");
    expect(types).toContain('"it": "eu"');
    expect(types).toContain('"fr": "eu"');
    expect(types).toContain('"en-US": "us"');
    expect(types).toContain("} as const satisfies Record<AppLocale, AppDeliveryArea>;");
    expect(types).toContain('export const AppLocales = ["en-US", "fr", "it"] as const;');
    expect(types).toContain("export type AppLocale = (typeof AppLocales)[number];");
    expect(types).toContain("export const LOCALE_FALLBACK");
    expect(types).toContain('"it": "en-US"');
    expect(types).toContain("some_key: Partial<Record<AppLocale, string>>;");
    expect(types).toContain("invoice_summary: Partial<Record<AppLocale, string>>;");
    expect(types).toContain("invoice_summary: { count: number }");

    expect(types).toContain("export type LazyNamespace = 'default' | 'billing';");

    expect(loaders).toContain(
      "[K in LazyNamespace]: (area: AppDeliveryArea) => Promise<AppSchema[K]>;"
    );
    expect(loaders).toContain("export const defaultLazyNamespaces");
    expect(loaders).toContain("default: (area) => {");
    expect(loaders).toContain("billing: (area) => {");
    expect(loaders).toContain('case "eu":');
    expect(loaders).toContain('case "us":');
    expect(loaders).toContain(
      "return import('./translations/billing.eu.json').then((m) => m.default);"
    );
    expect(loaders).toContain(
      "return import('./translations/billing.us.json').then((m) => m.default);"
    );

    expect(factory).toContain("partitionForLocale: (locale) => LOCALE_DELIVERY_AREA[locale]");
  });

  it("fails when deliveryArtifacts does not partition request locales", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });
    mkdirSync(join(tempDir, "src/i18n/generated"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/default.json"),
      JSON.stringify({
        some_key: { it: "Ciao", fr: "Hallo", "en-US": "Hello" },
      })
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        namespaces: {
          default: "src/i18n/translations/default.json",
        },
        delivery: "custom",
        deliveryArtifacts: {
          eu: ["it", "fr"],
        },
        localeFallback: {
          "en-US": null,
          it: "en-US",
          fr: null,
        },
        projectName: "App",
        codegenPath: "src/i18n/generated",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("missing locales");
    expect(result.stderr).toContain("en-US");
  });

  it("fails when yaml dictionary has invalid shape", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/translations.yaml"),
      `welcome:
  en: 123
`
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        namespaces: {
          default: "src/i18n/translations/translations.yaml",
        },
        projectName: "App",
        codegenPath: "src/i18n",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("must be a string");
  });
});
