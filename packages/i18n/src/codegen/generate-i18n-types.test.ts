import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
    expect(schema).toContain("validateExternalDictionary");
    expect(schema).toContain("validateExternalNamespace");
    expect(schema).toContain('"name": "string"');
  });

  it("does not generate dictionary schema file when dictionarySchemaOutput is omitted", () => {
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
      })
    );

    const result = runCodegen(tempDir);
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("dictionary-schema.generated.ts");
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
    expect(schema).toContain("validateExternalDictionary");
    expect(schema).not.toContain("validateExternalNamespaceImpl");
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
    expect(factory).toContain("IcuTranslationProviderSingle");
    expect(types).toContain("login_button: never;");
    expect(types).toContain("welcome: { name: string };");
    expect(types).not.toContain("default: {");
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
    expect(factory).toContain(
      "IcuTranslationProviderSingle<AppSchema, AppParams, AppLocale, typeof LOCALE_FALLBACK>"
    );
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
    expect(dictionary).toContain("export const dictionary: InitialSchema");
    expect(dictionary).not.toContain("billingNs");
    expect(factory).toContain("initialDictionary: InitialSchema = dictionary");
    expect(loaders).toContain("export const namespaceLoaders");
    expect(loaders).toContain("export async function ensureNamespacesLoaded(");
    expect(loaders).toContain("namespaces: LazyNamespace[]");
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

    const types = readFileSync(join(tempDir, "src/i18n/i18n-types.generated.ts"), "utf8");
    const dictionary = readFileSync(join(tempDir, "src/i18n/dictionary.generated.ts"), "utf8");
    const factory = readFileSync(join(tempDir, "src/i18n/instance.generated.ts"), "utf8");

    expect(types).not.toContain("LazyNamespace");
    expect(dictionary).toContain("export const dictionary: AppSchema");
    expect(dictionary).toContain("billingNs");
    expect(factory).toContain("initialDictionary: AppSchema = dictionary");
    expect(result.stdout).not.toContain("namespace-loaders.generated.ts");
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
});
