import {
  mkdtempSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it, afterEach } from "vitest";

const codegenScript = fileURLToPath(new URL("./generate-i18n-types.ts", import.meta.url));

function runCodegen(cwd: string, configFile = "i18n.codegen.json") {
  return spawnSync("tsx", [codegenScript, "--config", configFile], {
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
        typesOutput: "src/i18n/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/dictionary.generated.ts",
        instanceOutput: "src/i18n/instance.generated.ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).toBe(0);

    const types = readFileSync(join(tempDir, "src/i18n/i18n-types.generated.ts"), "utf8");
    const factory = readFileSync(join(tempDir, "src/i18n/instance.generated.ts"), "utf8");
    expect(types).toContain("export const I18N_MODE = 'multi' as const");
    expect(types).toContain("export type AppLocale = 'en'");
    expect(factory).toContain("export function createI18n(");
    expect(factory).toContain("options?: { onMissing?: OnMissingTranslation }");
    expect(factory).toContain("export function projectDictionaryLocales(");
    expect(factory).toContain("projectDictionaryLocalesCore(dictionary, locales)");
    expect(factory).toContain("export function projectNamespaceLocales(");
    expect(factory).toContain("projectNamespaceLocalesCore(dictionary, locales)");
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
        dictionary: "src/i18n/translations/translations.json",
        typesOutput: "src/i18n/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/dictionary.generated.ts",
        instanceOutput: "src/i18n/instance.generated.ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
      })
    );

    expect(runCodegen(tempDir).status).toBe(0);

    const generatedPaths = [
      join(tempDir, "src/i18n/i18n-types.generated.ts"),
      join(tempDir, "src/i18n/dictionary.generated.ts"),
      join(tempDir, "src/i18n/instance.generated.ts"),
    ];
    const mtimesBefore = generatedPaths.map((filePath) => statSync(filePath).mtimeMs);

    expect(runCodegen(tempDir).status).toBe(0);

    const mtimesAfter = generatedPaths.map((filePath) => statSync(filePath).mtimeMs);
    expect(mtimesAfter).toEqual(mtimesBefore);
  });

  it("generates dictionary schema file when dictionarySchemaOutput is set", () => {
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
        typesOutput: "src/i18n/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/dictionary.generated.ts",
        instanceOutput: "src/i18n/instance.generated.ts",
        dictionarySchemaOutput: "src/i18n/dictionary-schema.generated.ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
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

  it("generates single-mode dictionary schema without namespace validator", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/translations.json"),
      JSON.stringify({
        welcome: { en: "Welcome {name}!" },
      })
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        dictionary: "src/i18n/translations/translations.json",
        typesOutput: "src/i18n/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/dictionary.generated.ts",
        instanceOutput: "src/i18n/instance.generated.ts",
        dictionarySchemaOutput: "src/i18n/dictionary-schema.generated.ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).toBe(0);

    const schema = readFileSync(join(tempDir, "src/i18n/dictionary-schema.generated.ts"), "utf8");
    expect(schema).toContain("mode: 'single' as const");
    expect(schema).toContain("validateExternalDictionaryPartial");
    expect(schema).toContain("validateExternalKey");
  });

  it("generates flat types for single-file config", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/translations.json"),
      JSON.stringify({
        login_button: { en: "Login" },
        welcome: { en: "Welcome {name}!" },
      })
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        dictionary: "src/i18n/translations/translations.json",
        typesOutput: "src/i18n/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/dictionary.generated.ts",
        instanceOutput: "src/i18n/instance.generated.ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).toBe(0);

    const types = readFileSync(join(tempDir, "src/i18n/i18n-types.generated.ts"), "utf8");
    const factory = readFileSync(join(tempDir, "src/i18n/instance.generated.ts"), "utf8");
    expect(types).toContain("export const I18N_MODE = 'single' as const");
    expect(types).toContain("export type AppLocale = 'en'");
    expect(factory).toContain("export function createI18n(");
    expect(factory).toContain("export function projectDictionaryLocales(");
    expect(factory).toContain("dictionary: AppSchema");
    expect(factory).toContain("IcuTranslationProviderSingle");
    expect(types).toContain("login_button: never;");
    expect(types).toContain("welcome: { name: string };");
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
        dictionary: "src/i18n/translations/translations.json",
        typesOutput: "src/i18n/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/dictionary.generated.ts",
        instanceOutput: "src/i18n/instance.generated.ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
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
        dictionary: "src/i18n/translations/translations.json",
        typesOutput: "src/i18n/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/dictionary.generated.ts",
        instanceOutput: "src/i18n/instance.generated.ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
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
    expect(types).toContain("export type AppLocale = 'de-CH' | 'en'");
    expect(factory).toContain("localeFallback: LOCALE_FALLBACK");
    expect(factory).toContain("...options");
    expect(factory).toContain("projectNamespaceLocalesCore(dictionary, locales, LOCALE_FALLBACK)");
    expect(factory).toContain(
      "IcuTranslationProviderSingle<AppSchema, AppParams, AppLocale, typeof LOCALE_FALLBACK>"
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
        dictionary: "src/i18n/translations/translations.json",
        typesOutput: "src/i18n/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/dictionary.generated.ts",
        instanceOutput: "src/i18n/instance.generated.ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
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
    expect(types).toContain("export type AppLocale = 'en' | 'fr' | 'it'");
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
        dictionary: "src/i18n/translations/translations.json",
        typesOutput: "src/i18n/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/dictionary.generated.ts",
        instanceOutput: "src/i18n/instance.generated.ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).toBe(0);

    const types = readFileSync(join(tempDir, "src/i18n/i18n-types.generated.ts"), "utf8");
    const factory = readFileSync(join(tempDir, "src/i18n/instance.generated.ts"), "utf8");
    expect(factory).toContain("projectNamespaceLocalesCore(dictionary, locales)");
    expect(types).toContain("export type AppLocale = 'en' | 'it'");
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
        dictionary: "src/i18n/translations/translations.json",
        typesOutput: "src/i18n/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/dictionary.generated.ts",
        instanceOutput: "src/i18n/instance.generated.ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
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

  it("generates lazy namespace loaders when loadOnInit is a subset", () => {
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
        loadOnInit: ["default"],
        typesOutput: "src/i18n/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/dictionary.generated.ts",
        instanceOutput: "src/i18n/instance.generated.ts",
        dictionarySchemaOutput: "src/i18n/dictionary-schema.generated.ts",
        namespaceLoadersOutput: "src/i18n/namespace-loaders.generated.ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).toBe(0);

    const types = readFileSync(join(tempDir, "src/i18n/i18n-types.generated.ts"), "utf8");
    const dictionary = readFileSync(join(tempDir, "src/i18n/dictionary.generated.ts"), "utf8");
    const factory = readFileSync(join(tempDir, "src/i18n/instance.generated.ts"), "utf8");
    const loaders = readFileSync(join(tempDir, "src/i18n/namespace-loaders.generated.ts"), "utf8");

    expect(types).toContain("export type LoadOnInitNamespace = 'default'");
    expect(types).toContain("export type LazyNamespace = 'billing'");
    expect(types).toContain("export type InitialSchema = Pick<AppSchema, LoadOnInitNamespace>");
    expect(dictionary).toContain("export const defaultDictionary: InitialSchema");
    expect(factory).toContain("dictionary: InitialSchema,");
    expect(loaders).toContain("export const namespaceLoaders");
    expect(loaders).toContain("[K in LazyNamespace]: () => Promise<AppSchema[K]>");
    expect(loaders).toContain("import('./translations/billing.json')");
  });

  it("keeps eager output when loadOnInit is omitted", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/default.json"),
      JSON.stringify({ welcome: { en: "Welcome {name}!" } })
    );
    writeFileSync(
      join(tempDir, "src/i18n/translations/billing.json"),
      JSON.stringify({ invoice_summary: { en: "Invoice" } })
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        namespaces: {
          default: "src/i18n/translations/default.json",
          billing: "src/i18n/translations/billing.json",
        },
        typesOutput: "src/i18n/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/dictionary.generated.ts",
        instanceOutput: "src/i18n/instance.generated.ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).toBe(0);

    const dictionary = readFileSync(join(tempDir, "src/i18n/dictionary.generated.ts"), "utf8");
    const factory = readFileSync(join(tempDir, "src/i18n/instance.generated.ts"), "utf8");

    expect(dictionary).toContain("export const defaultDictionary: AppSchema");
    expect(dictionary).toContain("billingNs");
    expect(factory).toContain("dictionary: AppSchema,");
  });

  it("fails when loadOnInit is used in single mode", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/translations.json"),
      JSON.stringify({ welcome: { en: "Welcome" } })
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        dictionary: "src/i18n/translations/translations.json",
        loadOnInit: ["default"],
        typesOutput: "src/i18n/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/dictionary.generated.ts",
        instanceOutput: "src/i18n/instance.generated.ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("loadOnInit");
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
        dictionary: "src/i18n/translations/translations.json",
        typesOutput: "src/i18n/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/dictionary.generated.ts",
        instanceOutput: "src/i18n/instance.generated.ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
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
        dictionary: "src/i18n/translations/translations.json",
        typesOutput: "src/i18n/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/dictionary.generated.ts",
        instanceOutput: "src/i18n/instance.generated.ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
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
        dictionary: "src/i18n/translations/translations.json",
        typesOutput: "src/i18n/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/dictionary.generated.ts",
        instanceOutput: "src/i18n/instance.generated.ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
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
        dictionary: "src/i18n/translations/translations.json",
        typesOutput: "src/i18n/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/dictionary.generated.ts",
        instanceOutput: "src/i18n/instance.generated.ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
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
        typesOutput: "src/i18n/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/dictionary.generated.ts",
        instanceOutput: "src/i18n/instance.generated.ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
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
        dictionary: "src/i18n/translations/translations.json",
        typesOutput: "src/i18n/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/dictionary.generated.ts",
        instanceOutput: "src/i18n/instance.generated.ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).toBe(0);

    const dictionary = readFileSync(join(tempDir, "src/i18n/dictionary.generated.ts"), "utf8");
    const factory = readFileSync(join(tempDir, "src/i18n/instance.generated.ts"), "utf8");
    expect(dictionary).toContain("from './i18n-types.generated'");
    expect(factory).toContain("from './i18n-types.generated'");
    expect(factory).toContain("dictionary: AppSchema,");
  });

  it("supports importExtension .ts", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/translations.json"),
      JSON.stringify({ welcome: { en: "Welcome {name}!" } })
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        dictionary: "src/i18n/translations/translations.json",
        typesOutput: "src/i18n/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/dictionary.generated.ts",
        instanceOutput: "src/i18n/instance.generated.ts",
        importExtension: ".ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).toBe(0);

    const factory = readFileSync(join(tempDir, "src/i18n/instance.generated.ts"), "utf8");
    expect(factory).toContain("from './i18n-types.generated.ts'");
  });

  it("supports importExtension .js for NodeNext ESM projects", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/translations.json"),
      JSON.stringify({ welcome: { en: "Welcome {name}!" } })
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        dictionary: "src/i18n/translations/translations.json",
        typesOutput: "src/i18n/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/dictionary.generated.ts",
        instanceOutput: "src/i18n/instance.generated.ts",
        importExtension: ".js",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).toBe(0);

    const factory = readFileSync(join(tempDir, "src/i18n/instance.generated.ts"), "utf8");
    expect(factory).toContain("from './i18n-types.generated.js'");
  });

  it("fails when importExtension is invalid", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/translations.json"),
      JSON.stringify({ welcome: { en: "Welcome {name}!" } })
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        dictionary: "src/i18n/translations/translations.json",
        typesOutput: "src/i18n/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/dictionary.generated.ts",
        instanceOutput: "src/i18n/instance.generated.ts",
        importExtension: ".mjs",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Invalid i18n.codegen.json");
    expect(result.stderr).toContain("importExtension");
    expect(result.stderr).toContain('one of "none"|".ts"|".js"');
    expect(result.stderr).toContain("Allowed keys:");
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
        dictionary: "src/i18n/translations/translations.yaml",
        typesOutput: "src/i18n/generated/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/generated/dictionary.generated.ts",
        instanceOutput: "src/i18n/generated/instance.generated.ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "Compiled: src/i18n/translations/translations.yaml → src/i18n/generated/translations/translations.json"
    );

    const compiled = JSON.parse(
      readFileSync(join(tempDir, "src/i18n/generated/translations/translations.json"), "utf8")
    ) as Record<string, Record<string, string>>;
    expect(compiled.welcome?.en).toBe("Line one\nLine two\n");

    const dictionary = readFileSync(
      join(tempDir, "src/i18n/generated/dictionary.generated.ts"),
      "utf8"
    );
    const types = readFileSync(join(tempDir, "src/i18n/generated/i18n-types.generated.ts"), "utf8");
    expect(dictionary).toContain("from './translations/translations.json'");
    expect(types).toContain("welcome: Partial<Record<AppLocale, string>>;");
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
        typesOutput: "src/i18n/generated/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/generated/dictionary.generated.ts",
        instanceOutput: "src/i18n/generated/instance.generated.ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).toBe(0);

    const dictionary = readFileSync(
      join(tempDir, "src/i18n/generated/dictionary.generated.ts"),
      "utf8"
    );
    const types = readFileSync(join(tempDir, "src/i18n/generated/i18n-types.generated.ts"), "utf8");
    expect(dictionary).toContain("from '../translations/default.json'");
    expect(dictionary).toContain("from './translations/billing.json'");
    expect(types).toContain("login_button: Partial<Record<AppLocale, string>>;");
    expect(types).toContain("invoice_summary: Partial<Record<AppLocale, string>>;");
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
        loadOnInit: ["default"],
        typesOutput: "src/i18n/generated/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/generated/dictionary.generated.ts",
        instanceOutput: "src/i18n/generated/instance.generated.ts",
        dictionarySchemaOutput: "src/i18n/generated/dictionary-schema.generated.ts",
        namespaceLoadersOutput: "src/i18n/generated/namespace-loaders.generated.ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).toBe(0);

    const loaders = readFileSync(
      join(tempDir, "src/i18n/generated/namespace-loaders.generated.ts"),
      "utf8"
    );
    expect(loaders).toContain("import('./translations/billing.json')");
  });

  it("fails when dictionary extension is unsupported", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });

    writeFileSync(join(tempDir, "src/i18n/translations/translations.toml"), "welcome = {}");
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        dictionary: "src/i18n/translations/translations.toml",
        typesOutput: "src/i18n/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/dictionary.generated.ts",
        instanceOutput: "src/i18n/instance.generated.ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/unsupported dictionary (extension|format)/i);
  });

  it("generates split-by-locale delivery with per-locale files and defaultDictionaryFor", () => {
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
        typesOutput: "src/i18n/generated/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/generated/dictionary.generated.ts",
        instanceOutput: "src/i18n/generated/instance.generated.ts",
        namespaceLoadersOutput: "src/i18n/generated/namespace-loaders.generated.ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
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

    expect(existsSync(join(tempDir, "src/i18n/generated/dictionary.generated.ts"))).toBe(false);

    expect(types).toContain("welcome: Partial<Record<AppLocale, string>>;");
    expect(types).toContain("invoice_summary: Partial<Record<AppLocale, string>>;");
    expect(types).toContain("export type AppLocale = 'en' | 'it'");
    expect(types).toContain("invoice_summary: { count: number }");

    expect(types).toContain("export type LoadOnInitNamespace = never;");
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

  it("omits dictionaryOutput in split mode and removes stale dictionary at the default path", () => {
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
      join(tempDir, "src/i18n/generated/dictionary.generated.ts"),
      "// stale dictionary manifest\n"
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        namespaces: {
          default: "src/i18n/translations/default.json",
        },
        delivery: "split-by-locale",
        typesOutput: "src/i18n/generated/i18n-types.generated.ts",
        instanceOutput: "src/i18n/generated/instance.generated.ts",
        namespaceLoadersOutput: "src/i18n/generated/namespace-loaders.generated.ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).toBe(0);
    expect(existsSync(join(tempDir, "src/i18n/generated/dictionary.generated.ts"))).toBe(false);
  });

  it("writes delivery json under deliveryOutput when it differs from typesOutput directory", () => {
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
        deliveryOutput: "public/i18n",
        typesOutput: "src/i18n/generated/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/generated/dictionary.generated.ts",
        instanceOutput: "src/i18n/generated/instance.generated.ts",
        namespaceLoadersOutput: "src/i18n/generated/namespace-loaders.generated.ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
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

    expect(existsSync(join(tempDir, "src/i18n/generated/dictionary.generated.ts"))).toBe(false);
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
        typesOutput: "src/i18n/generated/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/generated/dictionary.generated.ts",
        instanceOutput: "src/i18n/generated/instance.generated.ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
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
    expect(types).toContain("export type AppLocale = 'de-CH' | 'de-DE' | 'en' | 'it'");
  });

  it("keeps canonical output when delivery is explicitly set to canonical", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-codegen-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });

    writeFileSync(
      join(tempDir, "src/i18n/translations/default.json"),
      JSON.stringify({ welcome: { en: "Welcome {name}!" } })
    );
    writeFileSync(
      join(tempDir, "src/i18n/translations/billing.json"),
      JSON.stringify({ invoice_summary: { en: "Invoice" } })
    );
    writeFileSync(
      join(tempDir, "i18n.codegen.json"),
      JSON.stringify({
        namespaces: {
          default: "src/i18n/translations/default.json",
          billing: "src/i18n/translations/billing.json",
        },
        loadOnInit: ["default"],
        delivery: "canonical",
        typesOutput: "src/i18n/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/dictionary.generated.ts",
        instanceOutput: "src/i18n/instance.generated.ts",
        namespaceLoadersOutput: "src/i18n/namespace-loaders.generated.ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).toBe(0);

    const dictionary = readFileSync(join(tempDir, "src/i18n/dictionary.generated.ts"), "utf8");
    const loaders = readFileSync(join(tempDir, "src/i18n/namespace-loaders.generated.ts"), "utf8");

    expect(dictionary).toContain("export const defaultDictionary: InitialSchema");
    expect(loaders).toContain("[K in LazyNamespace]: () => Promise<AppSchema[K]>");
    expect(loaders).toContain("import('./translations/billing.json')");
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
        typesOutput: "src/i18n/generated/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/generated/dictionary.generated.ts",
        instanceOutput: "src/i18n/generated/instance.generated.ts",
        namespaceLoadersOutput: "src/i18n/generated/namespace-loaders.generated.ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
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

    expect(types).toContain("export type AppDeliveryArea = 'eu' | 'us';");
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
    expect(types).toContain("export type AppLocale = 'en-US' | 'fr' | 'it';");
    expect(types).toContain("export const LOCALE_FALLBACK");
    expect(types).toContain('"it": "en-US"');
    expect(types).toContain("some_key: Partial<Record<AppLocale, string>>;");
    expect(types).toContain("invoice_summary: Partial<Record<AppLocale, string>>;");
    expect(types).toContain("invoice_summary: { count: number }");

    expect(existsSync(join(tempDir, "src/i18n/generated/dictionary.generated.ts"))).toBe(false);

    expect(types).toContain("export type LoadOnInitNamespace = never;");
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

    expect(factory).toContain("export function projectDictionaryForDeliveryArea(");
    expect(factory).toContain("export function projectNamespaceForDeliveryArea(");
    expect(factory).toContain(
      "projectDictionaryForDeliveryAreaCore(dictionary, areaLocales, LOCALE_FALLBACK)"
    );
    expect(factory).toContain(
      "projectNamespaceForDeliveryAreaCore(dictionary, areaLocales, LOCALE_FALLBACK)"
    );
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
        typesOutput: "src/i18n/generated/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/generated/dictionary.generated.ts",
        instanceOutput: "src/i18n/generated/instance.generated.ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
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
        dictionary: "src/i18n/translations/translations.yaml",
        typesOutput: "src/i18n/i18n-types.generated.ts",
        dictionaryOutput: "src/i18n/dictionary.generated.ts",
        instanceOutput: "src/i18n/instance.generated.ts",
        paramsTypeName: "AppParams",
        schemaTypeName: "AppSchema",
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("must be a string");
  });
});
