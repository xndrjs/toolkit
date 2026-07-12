import { describe, expect, it } from "vitest";
import { IcuTranslationProviderSingle } from "./IcuTranslationProviderSingle.js";
import type { LocaleOfSingle } from "./types.js";

type TestSchema = {
  login_button: { en: string; it: string };
  welcome: { en: string; it: string };
  empty_label: { en: string };
  broken: { en: string };
  invoice_count: { en: string; it: string };
  item_count_zero: { en: string };
  item_count_exact: { en: string };
  dashboard_status: { en: string; it: string };
  inbox_owner: { en: string; it: string };
  ranking_position: { en: string; it: string };
  account_balance: { en: string; it: string };
  appointment_summary: { en: string; it: string };
  invoice_due_long: { en: string; it: string };
  discount_rate: { en: string; it: string };
};

type TestParams = {
  login_button: never;
  welcome: { name: string };
  empty_label: never;
  broken: { name: string };
  invoice_count: { count: number };
  item_count_zero: { count: number };
  item_count_exact: { count: number };
  dashboard_status: { msgCount: number; chatCount: number };
  inbox_owner: { gender: string; name: string };
  ranking_position: { position: number };
  account_balance: { amount: number };
  appointment_summary: { dueDate: Date | number; startTime: Date | number };
  invoice_due_long: { dueDate: Date | number };
  discount_rate: { rate: number };
};

const dictionary: TestSchema = {
  login_button: { en: "Login", it: "Accedi" },
  welcome: { en: "Welcome {name}!", it: "Benvenuto {name}!" },
  empty_label: { en: "" },
  broken: { en: "Hi {name" },
  invoice_count: {
    en: "You have {count, plural, one {1 invoice} other {{count} invoices}}",
    it: "Hai {count, plural, one {1 fattura} other {{count} fatture}}",
  },
  item_count_zero: {
    en: "{count, plural, zero {no items} one {1 item} other {{count} items}}",
  },
  item_count_exact: {
    en: "{count, plural, =5 {five items} one {1 item} other {{count} items}}",
  },
  dashboard_status: {
    en: "You have {msgCount, plural, one {1 message} other {{msgCount} messages}} in {chatCount, plural, one {one chat} other {{chatCount} chats}}",
    it: "Hai {msgCount, plural, one {1 messaggio} other {{msgCount} messaggi}} in {chatCount, plural, one {una chat} other {{chatCount} chat}}",
  },
  inbox_owner: {
    en: "{gender, select, female {{name} owns her inbox} male {{name} owns his inbox} other {{name} owns their inbox}}",
    it: "{gender, select, other {{name} gestisce la propria casella}}",
  },
  ranking_position: {
    en: "You finished {position, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}",
    it: "Hai concluso al {position, selectordinal, one {#°} other {#°}} posto",
  },
  account_balance: {
    en: "Balance: {amount, number, ::currency/EUR}",
    it: "Saldo: {amount, number, ::currency/EUR}",
  },
  appointment_summary: {
    en: "Due {dueDate, date, short} at {startTime, time, short}",
    it: "Scade il {dueDate, date, short} alle {startTime, time, short}",
  },
  invoice_due_long: {
    en: "Payment due on {dueDate, date, ::yMMMMd}",
    it: "Pagamento entro il {dueDate, date, ::yMMMMd}",
  },
  discount_rate: {
    en: "Save {rate, number, ::percent} today",
    it: "Risparmia il {rate, number, ::percent} oggi",
  },
};

describe("IcuTranslationProviderSingle", () => {
  const provider = new IcuTranslationProviderSingle<TestSchema, TestParams>(dictionary);

  it("returns a static translation without params", () => {
    expect(provider.get("login_button", "it")).toBe("Accedi");
  });

  it("interpolates ICU arguments", () => {
    expect(provider.get("welcome", "en", { name: "Ada" })).toBe("Welcome Ada!");
  });

  describe("ICU plural interpolation", () => {
    it("formats a single numeric plural in English and Italian", () => {
      expect(provider.get("invoice_count", "en", { count: 1 })).toBe("You have 1 invoice");
      expect(provider.get("invoice_count", "en", { count: 5 })).toBe("You have 5 invoices");
      expect(provider.get("invoice_count", "it", { count: 1 })).toBe("Hai 1 fattura");
      expect(provider.get("invoice_count", "it", { count: 5 })).toBe("Hai 5 fatture");
    });

    it("uses =5 for an exact match; zero is a locale plural category, not exact match in English", () => {
      // ICU "zero" is a plural rule category (e.g. Arabic); in English, 0 maps to "other".
      expect(provider.get("item_count_zero", "en", { count: 0 })).toBe("0 items");
      // "=5" is an exact-value selector and matches count === 5 in any locale.
      expect(provider.get("item_count_exact", "en", { count: 0 })).toBe("0 items");
      expect(provider.get("item_count_exact", "en", { count: 1 })).toBe("1 item");
      expect(provider.get("item_count_exact", "en", { count: 5 })).toBe("five items");
    });

    it("formats nested numeric plurals with double-brace references", () => {
      expect(provider.get("dashboard_status", "en", { msgCount: 1, chatCount: 1 })).toBe(
        "You have 1 message in one chat"
      );
      expect(provider.get("dashboard_status", "en", { msgCount: 3, chatCount: 2 })).toBe(
        "You have 3 messages in 2 chats"
      );
      expect(provider.get("dashboard_status", "it", { msgCount: 1, chatCount: 1 })).toBe(
        "Hai 1 messaggio in una chat"
      );
      expect(provider.get("dashboard_status", "it", { msgCount: 3, chatCount: 2 })).toBe(
        "Hai 3 messaggi in 2 chat"
      );
    });

    it("throws when a required numeric plural parameter is missing", () => {
      expect(() => provider.get("dashboard_status", "en", { msgCount: 1 } as never)).toThrow(
        "[i18n Formatting Error]"
      );
    });
  });

  describe("additional ICU variants", () => {
    it("formats select arguments as strings", () => {
      expect(provider.get("inbox_owner", "en", { gender: "female", name: "Ada" })).toBe(
        "Ada owns her inbox"
      );
      expect(provider.get("inbox_owner", "en", { gender: "unknown", name: "Sam" })).toBe(
        "Sam owns their inbox"
      );
    });

    it("formats Italian select with a single other branch and the same params", () => {
      expect(provider.get("inbox_owner", "it", { gender: "female", name: "Ada" })).toBe(
        "Ada gestisce la propria casella"
      );
      expect(provider.get("inbox_owner", "it", { gender: "male", name: "Luca" })).toBe(
        "Luca gestisce la propria casella"
      );
    });

    it("formats selectordinal arguments as numbers", () => {
      expect(provider.get("ranking_position", "en", { position: 1 })).toBe("You finished 1st");
      expect(provider.get("ranking_position", "en", { position: 2 })).toBe("You finished 2nd");
      expect(provider.get("ranking_position", "en", { position: 3 })).toBe("You finished 3rd");
      expect(provider.get("ranking_position", "en", { position: 4 })).toBe("You finished 4th");
    });

    it("formats number, date, and time arguments", () => {
      const amount = 1234.5;
      const when = new Date("2026-07-01T13:30:00Z");

      const expectedAmount = new Intl.NumberFormat("en", {
        style: "currency",
        currency: "EUR",
      }).format(amount);
      const expectedDate = new Intl.DateTimeFormat("en", {
        dateStyle: "short",
      }).format(when);
      const expectedTime = new Intl.DateTimeFormat("en", {
        timeStyle: "short",
      }).format(when);

      expect(provider.get("account_balance", "en", { amount })).toBe(`Balance: ${expectedAmount}`);
      expect(
        provider.get("appointment_summary", "en", {
          dueDate: when,
          startTime: when,
        })
      ).toBe(`Due ${expectedDate} at ${expectedTime}`);
    });

    it("formats ICU date and number skeletons (::yMMMMd, ::percent)", () => {
      const when = new Date("2026-07-01T13:30:00Z");
      const expectedLongDate = new Intl.DateTimeFormat("en", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(when);
      const expectedPercent = new Intl.NumberFormat("en", {
        style: "percent",
      }).format(0.25);

      expect(provider.get("invoice_due_long", "en", { dueDate: when })).toBe(
        `Payment due on ${expectedLongDate}`
      );
      expect(provider.get("discount_rate", "en", { rate: 0.25 })).toBe(
        `Save ${expectedPercent} today`
      );
    });
  });

  it("treats an empty string template as valid", () => {
    expect(provider.get("empty_label", "en")).toBe("");
  });

  it("throws when the key or locale is missing", () => {
    expect(() =>
      provider.get("login_button", "fr" as unknown as LocaleOfSingle<TestSchema>)
    ).toThrow('[i18n] Missing key or locale: "login_button" [fr] (fallback chain: fr)');
    expect(() => provider.get("missing_key" as "login_button", "en")).toThrow(
      '[i18n] Missing key or locale: "missing_key" [en] (fallback chain: en)'
    );
  });

  it("throws on malformed ICU syntax", () => {
    expect(() => provider.get("broken", "en", { name: "Ada" })).toThrow("[i18n ICU Syntax Error]");
  });

  it("throws when required parameters are missing", () => {
    // @ts-expect-error
    expect(() => provider.get("welcome", "en")).toThrow("[i18n Formatting Error]");
  });

  it("replaces the dictionary and invalidates cache on setAll", () => {
    const local = new IcuTranslationProviderSingle<TestSchema, TestParams>(dictionary);
    expect(local.get("login_button", "en")).toBe("Login");

    local.setAll({
      ...dictionary,
      login_button: { en: "Sign in", it: "Entra" },
    });

    expect(local.get("login_button", "en")).toBe("Sign in");
  });

  it("merges locales per key with mergeAll without dropping existing locales", () => {
    const local = new IcuTranslationProviderSingle<TestSchema, TestParams>({
      ...dictionary,
      // @ts-expect-error missing locale
      welcome: {
        en: "Welcome {name}!",
      },
    });

    local.mergeAll({
      // @ts-expect-error missing locale
      welcome: {
        it: "Benvenuto {name}!",
      },
    });

    expect(local.get("welcome", "en", { name: "Ada" })).toBe("Welcome Ada!");
    expect(local.get("welcome", "it", { name: "Ada" })).toBe("Benvenuto Ada!");
    expect(local.get("login_button", "en")).toBe("Login");
  });

  it("returns a deep-frozen snapshot from getAll", () => {
    expect(provider.getAll()).toEqual(dictionary);
    expect(provider.getAll()).not.toBe(dictionary);
    expect(Object.isFrozen(provider.getAll())).toBe(true);
  });

  it("does not mutate the provider when getAll snapshot is modified", () => {
    const snapshot = provider.getAll();
    expect(() => {
      snapshot.welcome.en = "Hacked";
    }).toThrow(TypeError);
    expect(provider.get("welcome", "en", { name: "Ada" })).toBe("Welcome Ada!");
  });

  it("does not reflect external dictionary mutations after construction", () => {
    const external = {
      login_button: { en: "Login", it: "Accedi" },
      welcome: { en: "Welcome {name}!", it: "Benvenuto {name}!" },
      empty_label: { en: "" },
      broken: { en: "Hi {name" },
      invoice_count: {
        en: "You have {count, plural, one {1 invoice} other {{count} invoices}}",
        it: "Hai {count, plural, one {1 fattura} other {{count} fatture}}",
      },
      item_count_zero: dictionary.item_count_zero,
      item_count_exact: dictionary.item_count_exact,
      dashboard_status: dictionary.dashboard_status,
      inbox_owner: dictionary.inbox_owner,
      ranking_position: dictionary.ranking_position,
      account_balance: dictionary.account_balance,
      appointment_summary: dictionary.appointment_summary,
      invoice_due_long: dictionary.invoice_due_long,
      discount_rate: dictionary.discount_rate,
    };
    const local = new IcuTranslationProviderSingle<TestSchema, TestParams>(external);
    external.login_button.en = "Sign in";
    expect(local.get("login_button", "en")).toBe("Login");
  });

  describe("forLocale", () => {
    it("binds a locale so get() no longer requires it", () => {
      const en = provider.forLocale("en");

      expect(en.locale).toBe("en");
      expect(en.get("login_button")).toBe("Login");
      expect(en.get("welcome", { name: "Ada" })).toBe("Welcome Ada!");
    });

    it("uses the parent provider cache and fallback rules", () => {
      const fallbackMap = {
        en: null,
        "de-CH": "en",
      } as const;
      const fallbackProvider = new IcuTranslationProviderSingle<
        TestSchema,
        TestParams,
        keyof typeof fallbackMap | LocaleOfSingle<TestSchema>,
        typeof fallbackMap
      >(dictionary, { localeFallback: fallbackMap });
      const deCh = fallbackProvider.forLocale("de-CH");

      expect(deCh.get("login_button")).toBe("Login");
    });
  });

  describe("locale fallback", () => {
    const fallbackMap = {
      en: null,
      "de-DE": "en",
      "de-CH": "de-DE",
      it: "en",
    } as const;

    const fallbackProvider = new IcuTranslationProviderSingle<
      TestSchema,
      TestParams,
      keyof typeof fallbackMap | LocaleOfSingle<TestSchema>,
      typeof fallbackMap
    >(dictionary, { localeFallback: fallbackMap });

    it("resolves a locale through the fallback chain", () => {
      expect(fallbackProvider.get("login_button", "de-CH")).toBe("Login");
    });

    it("uses an intermediate locale template when available", () => {
      const withGerman = new IcuTranslationProviderSingle<
        TestSchema & {
          login_button: { en: string; it: string; "de-DE": string };
        },
        TestParams,
        keyof typeof fallbackMap | LocaleOfSingle<TestSchema>,
        typeof fallbackMap
      >(
        {
          ...dictionary,
          login_button: { en: "Login", it: "Accedi", "de-DE": "Anmelden" },
        },
        { localeFallback: fallbackMap }
      );

      expect(withGerman.get("login_button", "de-CH")).toBe("Anmelden");
    });

    it("throws when the fallback chain cannot resolve a template", () => {
      const unresolvedFallback = {
        en: null,
        "de-CH": "fr",
        fr: null,
      } as const;
      const unresolvedProvider = new IcuTranslationProviderSingle<
        TestSchema,
        TestParams,
        keyof typeof unresolvedFallback | LocaleOfSingle<TestSchema>,
        typeof unresolvedFallback
      >(dictionary, { localeFallback: unresolvedFallback });

      expect(() => unresolvedProvider.get("login_button", "de-CH")).toThrow(
        '[i18n] Missing key or locale: "login_button" [de-CH] (fallback chain: de-CH → fr)'
      );
    });

    it("rejects circular fallback maps at construction", () => {
      expect(
        () =>
          new IcuTranslationProviderSingle(dictionary, {
            localeFallback: { a: "b", b: "a" },
          })
      ).toThrow("[i18n] Circular locale fallback detected");
    });
  });

  describe("onMissing", () => {
    it('throws on missing translations with onMissing: "throw" (explicit default)', () => {
      const local = new IcuTranslationProviderSingle<TestSchema, TestParams>(dictionary, {
        onMissing: "throw",
      });
      expect(() => local.get("missing_key" as "login_button", "en")).toThrow(
        '[i18n] Missing key or locale: "missing_key" [en] (fallback chain: en)'
      );
    });

    it('returns the key itself with onMissing: "key"', () => {
      const local = new IcuTranslationProviderSingle<TestSchema, TestParams>(dictionary, {
        onMissing: "key",
      });
      expect(local.get("missing_key" as "login_button", "en")).toBe("missing_key");
    });

    it("calls a custom handler with the missing-translation context", () => {
      const contexts: unknown[] = [];
      const local = new IcuTranslationProviderSingle<TestSchema, TestParams>(dictionary, {
        onMissing: (context) => {
          contexts.push(context);
          return `<missing:${context.key}>`;
        },
      });

      expect(local.get("missing_key" as "login_button", "en")).toBe("<missing:missing_key>");
      expect(contexts).toEqual([{ key: "missing_key", locale: "en", fallbackChain: "en" }]);
    });

    it("includes the walked fallback chain in the handler context", () => {
      const fallbackMap = { en: null, "de-CH": "fr", fr: null } as const;
      const contexts: { fallbackChain: string }[] = [];
      const local = new IcuTranslationProviderSingle<
        TestSchema,
        TestParams,
        keyof typeof fallbackMap | LocaleOfSingle<TestSchema>,
        typeof fallbackMap
      >(dictionary, {
        localeFallback: fallbackMap,
        onMissing: (context) => {
          contexts.push(context);
          return context.key;
        },
      });

      expect(local.get("login_button", "de-CH")).toBe("login_button");
      expect(contexts[0]?.fallbackChain).toBe("de-CH → fr");
    });

    it("still throws ICU syntax and formatting errors with a lenient onMissing", () => {
      const local = new IcuTranslationProviderSingle<TestSchema, TestParams>(dictionary, {
        onMissing: "key",
      });
      expect(() => local.get("broken", "en", { name: "Ada" })).toThrow("[i18n ICU Syntax Error]");
      // @ts-expect-error
      expect(() => local.get("welcome", "en")).toThrow("[i18n Formatting Error]");
    });

    it("applies onMissing through forLocale wrappers", () => {
      const local = new IcuTranslationProviderSingle<TestSchema, TestParams>(dictionary, {
        onMissing: "key",
      });
      expect(local.forLocale("en").get("missing_key" as "login_button")).toBe("missing_key");
    });
  });
});
