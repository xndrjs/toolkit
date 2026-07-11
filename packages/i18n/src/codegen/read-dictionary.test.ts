import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import {
  getDictionaryFormat,
  prepareDictionaryEntries,
  readDictionaryFile,
  resolveAreaJsonPath,
  resolveCompiledJsonPath,
  resolveSplitJsonPath,
  splitDictionaryByDeliveryArea,
  splitDictionaryByLocale,
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

  it("resolves split json path per locale under the generated output directory", () => {
    expect(
      resolveSplitJsonPath("src/i18n/translations/user.json", "it", "src/i18n/generated")
    ).toBe("src/i18n/generated/translations/user.it.json");
    expect(resolveSplitJsonPath("translations/billing.yaml", "en", "generated")).toBe(
      "generated/translations/billing.en.json"
    );
  });

  it("resolves area json path under the generated output directory", () => {
    expect(
      resolveAreaJsonPath("src/i18n/translations/billing.json", "eu", "src/i18n/generated")
    ).toBe("src/i18n/generated/translations/billing.eu.json");
    expect(resolveAreaJsonPath("translations/default.yaml", "us", "generated")).toBe(
      "generated/translations/default.us.json"
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

  it("rejects keys with characters outside letters, digits, and underscore", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-read-dict-"));
    const jsonPath = join(tempDir, "default.json");
    writeFileSync(jsonPath, JSON.stringify({ "app.title": { en: "My App" } }));

    expect(() => readDictionaryFile(jsonPath)).toThrow(
      "[Codegen Error] Dictionary file " +
        jsonPath +
        ': invalid key "app.title" (allowed: letters, digits, underscore; must not start with a digit).'
    );
  });

  it("rejects keys starting with a digit", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-read-dict-"));
    const jsonPath = join(tempDir, "default.json");
    writeFileSync(jsonPath, JSON.stringify({ "1key": { en: "One" } }));

    expect(() => readDictionaryFile(jsonPath)).toThrow('invalid key "1key"');
  });

  it("accepts keys made of letters, digits, and underscore", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-read-dict-"));
    const jsonPath = join(tempDir, "default.json");
    writeFileSync(
      jsonPath,
      JSON.stringify({ _private: { en: "ok" }, welcome_2: { en: "ok" }, CamelCase: { en: "ok" } })
    );

    expect(() => readDictionaryFile(jsonPath)).not.toThrow();
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
      "src/i18n/generated",
      {
        dictionariesByNamespace: {
          billing: readDictionaryFile(join(tempDir, "src/i18n/translations/billing.yaml")),
        },
      }
    );

    expect(result.resolvedEntries).toEqual([
      { namespace: "billing", filePath: "src/i18n/generated/translations/billing.json" },
    ]);
    expect(result.splitPathsByNamespace).toEqual({});
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
      "generated",
      {
        dictionariesByNamespace: {
          default: readDictionaryFile(join(tempDir, "translations/default.json")),
        },
      }
    );

    expect(result.resolvedEntries).toEqual([
      { namespace: "default", filePath: "translations/default.json" },
    ]);
    expect(result.splitPathsByNamespace).toEqual({});
    expect(result.compiledFiles).toEqual([]);
  });

  it("splits multiple namespaces into per-locale files", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-read-dict-"));
    mkdirSync(join(tempDir, "translations"), { recursive: true });
    mkdirSync(join(tempDir, "generated"), { recursive: true });
    writeFileSync(
      join(tempDir, "translations/user.json"),
      JSON.stringify({
        profile_title: { en: "Your profile", it: "Il tuo profilo" },
      })
    );
    writeFileSync(
      join(tempDir, "translations/billing.json"),
      JSON.stringify({
        invoice_summary: { en: "You have {count} invoices", it: "Hai {count} fatture" },
      })
    );

    const result = prepareDictionaryEntries(
      tempDir,
      [
        { namespace: "user", filePath: "translations/user.json" },
        { namespace: "billing", filePath: "translations/billing.json" },
      ],
      "generated",
      {
        dictionariesByNamespace: {
          user: readDictionaryFile(join(tempDir, "translations/user.json")),
          billing: readDictionaryFile(join(tempDir, "translations/billing.json")),
        },
        delivery: "split-by-locale",
        requestLocales: ["en", "it"],
      }
    );

    expect(result.splitPathsByNamespace).toEqual({
      user: {
        en: "generated/translations/user.en.json",
        it: "generated/translations/user.it.json",
      },
      billing: {
        en: "generated/translations/billing.en.json",
        it: "generated/translations/billing.it.json",
      },
    });

    const userEn = JSON.parse(
      readFileSync(join(tempDir, "generated/translations/user.en.json"), "utf8")
    ) as Record<string, Record<string, string>>;
    expect(userEn.profile_title).toEqual({ en: "Your profile" });

    const billingIt = JSON.parse(
      readFileSync(join(tempDir, "generated/translations/billing.it.json"), "utf8")
    ) as Record<string, Record<string, string>>;
    expect(billingIt.invoice_summary).toEqual({ it: "Hai {count} fatture" });
  });

  it("splits json sources into per-locale files under generated without touching the source", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-read-dict-"));
    mkdirSync(join(tempDir, "translations"), { recursive: true });
    mkdirSync(join(tempDir, "generated"), { recursive: true });
    const sourcePath = join(tempDir, "translations/user.json");
    writeFileSync(
      sourcePath,
      JSON.stringify({
        profile_title: { en: "Your profile", it: "Il tuo profilo" },
        greeting: { en: "Hello {name}!", it: "Ciao {name}!" },
      })
    );

    const result = prepareDictionaryEntries(
      tempDir,
      [{ namespace: "user", filePath: "translations/user.json" }],
      "generated",
      {
        dictionariesByNamespace: { user: readDictionaryFile(sourcePath) },
        delivery: "split-by-locale",
        requestLocales: ["en", "it"],
      }
    );

    expect(result.resolvedEntries).toEqual([
      { namespace: "user", filePath: "translations/user.json" },
    ]);
    expect(result.splitPathsByNamespace).toEqual({
      user: {
        en: "generated/translations/user.en.json",
        it: "generated/translations/user.it.json",
      },
    });
    expect(result.compiledFiles).toEqual([
      "translations/user.json → generated/translations/user.en.json",
      "translations/user.json → generated/translations/user.it.json",
    ]);

    const sourceAfter = JSON.parse(readFileSync(sourcePath, "utf8")) as Record<
      string,
      Record<string, string>
    >;
    expect(sourceAfter.profile_title).toEqual({ en: "Your profile", it: "Il tuo profilo" });

    const enSplit = JSON.parse(
      readFileSync(join(tempDir, "generated/translations/user.en.json"), "utf8")
    ) as Record<string, Record<string, string>>;
    expect(enSplit).toEqual({
      profile_title: { en: "Your profile" },
      greeting: { en: "Hello {name}!" },
    });

    const itSplit = JSON.parse(
      readFileSync(join(tempDir, "generated/translations/user.it.json"), "utf8")
    ) as Record<string, Record<string, string>>;
    expect(itSplit).toEqual({
      profile_title: { it: "Il tuo profilo" },
      greeting: { it: "Ciao {name}!" },
    });
  });

  it("splits yaml sources into per-locale json without emitting a canonical intermediate", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-read-dict-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });
    mkdirSync(join(tempDir, "src/i18n/generated"), { recursive: true });
    writeFileSync(
      join(tempDir, "src/i18n/translations/billing.yaml"),
      `invoice_summary:
  en: You have {count} invoices
  it: Hai {count} fatture
`
    );

    const result = prepareDictionaryEntries(
      tempDir,
      [{ namespace: "billing", filePath: "src/i18n/translations/billing.yaml" }],
      "src/i18n/generated",
      {
        dictionariesByNamespace: {
          billing: readDictionaryFile(join(tempDir, "src/i18n/translations/billing.yaml")),
        },
        delivery: "split-by-locale",
        requestLocales: ["en", "it"],
      }
    );

    expect(result.resolvedEntries).toEqual([
      { namespace: "billing", filePath: "src/i18n/translations/billing.yaml" },
    ]);
    expect(result.splitPathsByNamespace.billing).toEqual({
      en: "src/i18n/generated/translations/billing.en.json",
      it: "src/i18n/generated/translations/billing.it.json",
    });

    const canonicalPath = join(tempDir, "src/i18n/generated/translations/billing.json");
    expect(() => readFileSync(canonicalPath, "utf8")).toThrow();

    const enSplit = JSON.parse(
      readFileSync(join(tempDir, "src/i18n/generated/translations/billing.en.json"), "utf8")
    ) as Record<string, Record<string, string>>;
    expect(enSplit.invoice_summary?.en).toBe("You have {count} invoices");
  });

  it("applies localeFallback when splitting dictionaries", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-read-dict-"));
    mkdirSync(join(tempDir, "translations"), { recursive: true });
    mkdirSync(join(tempDir, "generated"), { recursive: true });
    writeFileSync(
      join(tempDir, "translations/default.json"),
      JSON.stringify({
        login_button: { en: "Login", it: "Accedi" },
      })
    );

    const localeFallback = {
      en: null,
      "de-DE": "en",
      "de-CH": "de-DE",
      it: "en",
    } as const;

    prepareDictionaryEntries(
      tempDir,
      [{ namespace: "default", filePath: "translations/default.json" }],
      "generated",
      {
        dictionariesByNamespace: {
          default: readDictionaryFile(join(tempDir, "translations/default.json")),
        },
        delivery: "split-by-locale",
        requestLocales: ["de-CH"],
        localeFallback,
      }
    );

    const deChSplit = JSON.parse(
      readFileSync(join(tempDir, "generated/translations/default.de-CH.json"), "utf8")
    ) as Record<string, Record<string, string>>;
    expect(deChSplit).toEqual({
      login_button: { "de-CH": "Login" },
    });
  });

  it("uses the provided parsed dictionaries instead of re-reading sources", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-read-dict-"));
    mkdirSync(join(tempDir, "translations"), { recursive: true });
    mkdirSync(join(tempDir, "generated"), { recursive: true });
    writeFileSync(
      join(tempDir, "translations/default.json"),
      JSON.stringify({ welcome: { en: "On disk" } })
    );

    prepareDictionaryEntries(
      tempDir,
      [{ namespace: "default", filePath: "translations/default.json" }],
      "generated",
      {
        dictionariesByNamespace: { default: { welcome: { en: "In memory" } } },
        delivery: "split-by-locale",
        requestLocales: ["en"],
      }
    );

    const enSplit = JSON.parse(
      readFileSync(join(tempDir, "generated/translations/default.en.json"), "utf8")
    ) as Record<string, Record<string, string>>;
    expect(enSplit.welcome).toEqual({ en: "In memory" });
  });

  it("throws when a parsed dictionary is missing for a namespace", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-read-dict-"));
    mkdirSync(join(tempDir, "translations"), { recursive: true });
    writeFileSync(
      join(tempDir, "translations/default.json"),
      JSON.stringify({ welcome: { en: "Welcome" } })
    );

    expect(() =>
      prepareDictionaryEntries(
        tempDir,
        [{ namespace: "default", filePath: "translations/default.json" }],
        "generated",
        { dictionariesByNamespace: {} }
      )
    ).toThrow('[Codegen Error] Missing parsed dictionary for namespace "default".');
  });

  it("projects each locale independently via splitDictionaryByLocale", () => {
    const dictionary = {
      login_button: { en: "Login", it: "Accedi" },
      welcome: { en: "Welcome {name}!", it: "Benvenuto {name}!" },
    };
    const localeFallback = {
      en: null,
      "de-CH": "en",
    } as const;

    expect(splitDictionaryByLocale(dictionary, ["en", "it"])).toEqual({
      en: {
        login_button: { en: "Login" },
        welcome: { en: "Welcome {name}!" },
      },
      it: {
        login_button: { it: "Accedi" },
        welcome: { it: "Benvenuto {name}!" },
      },
    });

    expect(splitDictionaryByLocale(dictionary, ["de-CH"], localeFallback)).toEqual({
      "de-CH": {
        login_button: { "de-CH": "Login" },
        welcome: { "de-CH": "Welcome {name}!" },
      },
    });
  });

  it("splits dictionaries into per-area files with hybrid projection", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-read-dict-"));
    mkdirSync(join(tempDir, "translations"), { recursive: true });
    mkdirSync(join(tempDir, "generated"), { recursive: true });
    writeFileSync(
      join(tempDir, "translations/default.json"),
      JSON.stringify({
        some_key: { it: "Ciao", fr: "Hallo", "en-US": "Hello" },
        some_other_key: { "en-US": "Computer", fr: "Ordinateur" },
      })
    );

    const deliveryArtifacts = {
      eu: ["it", "fr"],
      us: ["en-US"],
    };
    const localeFallback = {
      "en-US": null,
      it: "en-US",
      fr: null,
    } as const;

    const result = prepareDictionaryEntries(
      tempDir,
      [{ namespace: "default", filePath: "translations/default.json" }],
      "generated",
      {
        dictionariesByNamespace: {
          default: readDictionaryFile(join(tempDir, "translations/default.json")),
        },
        delivery: "custom",
        deliveryArtifacts,
        localeFallback,
      }
    );

    expect(result.splitPathsByNamespace).toEqual({
      default: {
        eu: "generated/translations/default.eu.json",
        us: "generated/translations/default.us.json",
      },
    });
    expect(result.compiledFiles).toEqual([
      "translations/default.json → generated/translations/default.eu.json",
      "translations/default.json → generated/translations/default.us.json",
    ]);

    const euArea = JSON.parse(
      readFileSync(join(tempDir, "generated/translations/default.eu.json"), "utf8")
    ) as Record<string, Record<string, string>>;
    expect(euArea).toEqual({
      some_key: { it: "Ciao", fr: "Hallo" },
      some_other_key: { it: "Computer", fr: "Ordinateur" },
    });

    const usArea = JSON.parse(
      readFileSync(join(tempDir, "generated/translations/default.us.json"), "utf8")
    ) as Record<string, Record<string, string>>;
    expect(usArea).toEqual({
      some_key: { "en-US": "Hello" },
      some_other_key: { "en-US": "Computer" },
    });
  });

  it("splits yaml sources into per-area json without emitting a canonical intermediate", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-read-dict-"));
    mkdirSync(join(tempDir, "src/i18n/translations"), { recursive: true });
    mkdirSync(join(tempDir, "src/i18n/generated"), { recursive: true });
    writeFileSync(
      join(tempDir, "src/i18n/translations/billing.yaml"),
      `invoice_summary:
  en-US: You have {count} invoices
  it: Hai {count} fatture
`
    );

    const result = prepareDictionaryEntries(
      tempDir,
      [{ namespace: "billing", filePath: "src/i18n/translations/billing.yaml" }],
      "src/i18n/generated",
      {
        dictionariesByNamespace: {
          billing: readDictionaryFile(join(tempDir, "src/i18n/translations/billing.yaml")),
        },
        delivery: "custom",
        deliveryArtifacts: { us: ["en-US"], eu: ["it"] },
        localeFallback: { "en-US": null, it: "en-US" },
      }
    );

    expect(result.resolvedEntries).toEqual([
      { namespace: "billing", filePath: "src/i18n/translations/billing.yaml" },
    ]);
    expect(result.splitPathsByNamespace.billing).toEqual({
      eu: "src/i18n/generated/translations/billing.eu.json",
      us: "src/i18n/generated/translations/billing.us.json",
    });

    expect(() =>
      readFileSync(join(tempDir, "src/i18n/generated/translations/billing.json"), "utf8")
    ).toThrow();

    const euArea = JSON.parse(
      readFileSync(join(tempDir, "src/i18n/generated/translations/billing.eu.json"), "utf8")
    ) as Record<string, Record<string, string>>;
    expect(euArea.invoice_summary).toEqual({ it: "Hai {count} fatture" });
  });

  it("projects each delivery area via splitDictionaryByDeliveryArea", () => {
    const dictionary = {
      some_key: { it: "Ciao", fr: "Hallo", "en-US": "Hello" },
      some_other_key: { "en-US": "Computer", fr: "Ordinateur" },
    };
    const deliveryArtifacts = {
      eu: ["it", "fr"],
      us: ["en-US"],
    };
    const localeFallback = {
      "en-US": null,
      it: "en-US",
      fr: null,
    } as const;

    expect(splitDictionaryByDeliveryArea(dictionary, deliveryArtifacts, localeFallback)).toEqual({
      eu: {
        some_key: { it: "Ciao", fr: "Hallo" },
        some_other_key: { it: "Computer", fr: "Ordinateur" },
      },
      us: {
        some_key: { "en-US": "Hello" },
        some_other_key: { "en-US": "Computer" },
      },
    });
  });
});
