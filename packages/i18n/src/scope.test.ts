import { describe, expect, it } from "vitest";
import { IcuTranslationProviderMulti } from "./IcuTranslationProviderMulti.js";
import { IcuTranslationProviderSingle } from "./IcuTranslationProviderSingle.js";
import type { LocaleOfMulti, LocaleOfSingle } from "./types.js";

type SingleSchema = {
  login_button: { en: string; it: string };
  welcome: { en: string; it: string };
  empty_label: { en: string };
  broken: { en: string };
  invoice_count: { en: string; it: string };
  dashboard_status: { en: string; it: string };
  inbox_owner: { en: string; it: string };
  ranking_position: { en: string; it: string };
  account_balance: { en: string; it: string };
  appointment_summary: { en: string; it: string };
};

type SingleParams = {
  login_button: never;
  welcome: { name: string };
  empty_label: never;
  broken: { name: string };
  invoice_count: { count: number };
  dashboard_status: { msgCount: number; chatCount: number };
  inbox_owner: { gender: string; name: string };
  ranking_position: { position: number };
  account_balance: { amount: number };
  appointment_summary: { dueDate: Date | number; startTime: Date | number };
};

const singleDictionary: SingleSchema = {
  login_button: { en: "Login", it: "Accedi" },
  welcome: { en: "Welcome {name}!", it: "Benvenuto {name}!" },
  empty_label: { en: "" },
  broken: { en: "Hi {name" },
  invoice_count: {
    en: "You have {count, plural, one {1 invoice} other {{count} invoices}}",
    it: "Hai {count, plural, one {1 fattura} other {{count} fatture}}",
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
};

type MultiSchema = {
  default: {
    login_button: { en: string; it: string };
    welcome: { en: string };
    dashboard_status: { en: string; it: string };
    inbox_owner: { en: string; it: string };
    ranking_position: { en: string; it: string };
  };
  billing: {
    invoice_summary: { en: string; it: string };
    account_balance: { en: string; it: string };
    appointment_summary: { en: string; it: string };
    empty_label: { en: string };
  };
};

type MultiParams = {
  default: {
    login_button: never;
    welcome: { name: string };
    dashboard_status: { msgCount: number; chatCount: number };
    inbox_owner: { gender: string; name: string };
    ranking_position: { position: number };
  };
  billing: {
    invoice_summary: { count: number; name: string };
    account_balance: { amount: number };
    appointment_summary: { dueDate: Date | number; startTime: Date | number };
    empty_label: never;
  };
};

const multiDictionary: MultiSchema = {
  default: {
    login_button: { en: "Login", it: "Accedi" },
    welcome: { en: "Welcome {name}!" },
    dashboard_status: {
      en: "You have {msgCount, plural, one {1 message} other {{msgCount} messages}} in {chatCount, plural, one {one chat} other {{chatCount} chats}}",
      it: "Hai {msgCount, plural, one {1 messaggio} other {{msgCount} messaggi}} in {chatCount, plural, one {una chat} other {{chatCount} chat}}",
    },
    inbox_owner: {
      en: "{gender, select, female {{name} owns her inbox} male {{name} owns his inbox} other {{name} owns their inbox}}",
      it: "{gender, select, female {{name} gestisce la sua casella} male {{name} gestisce la sua casella} other {{name} gestisce la propria casella}}",
    },
    ranking_position: {
      en: "You finished {position, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}",
      it: "Hai concluso al {position, selectordinal, one {#°} other {#°}} posto",
    },
  },
  billing: {
    invoice_summary: {
      en: "You have {count, plural, one {1 invoice} other {{count} invoices}} for {name}",
      it: "Hai {count, plural, one {1 fattura} other {{count} fatture}} per {name}",
    },
    account_balance: {
      en: "Balance: {amount, number, ::currency/EUR}",
      it: "Saldo: {amount, number, ::currency/EUR}",
    },
    appointment_summary: {
      en: "Due {dueDate, date, short} at {startTime, time, short}",
      it: "Scade il {dueDate, date, short} alle {startTime, time, short}",
    },
    empty_label: { en: "" },
  },
};

describe("I18nScope single", () => {
  const engine = new IcuTranslationProviderSingle<SingleSchema, SingleParams>(singleDictionary);
  const view = engine.toScope();

  it("translates with t(key, locale)", () => {
    expect(view.t("login_button", "it")).toBe("Accedi");
    expect(view.t("welcome", "en", { name: "Ada" })).toBe("Welcome Ada!");
  });

  it("formats ICU plurals and nested plurals", () => {
    expect(view.t("invoice_count", "en", { count: 1 })).toBe("You have 1 invoice");
    expect(view.t("invoice_count", "en", { count: 5 })).toBe("You have 5 invoices");
    expect(view.t("dashboard_status", "en", { msgCount: 3, chatCount: 2 })).toBe(
      "You have 3 messages in 2 chats"
    );
  });

  it("binds locale via forLocale", () => {
    const en = view.forLocale("en");

    expect(en.locale).toBe("en");
    expect(en.t("login_button")).toBe("Login");
    expect(en.t("welcome", { name: "Ada" })).toBe("Welcome Ada!");
  });

  it("binds locale via toScope({ locale })", () => {
    const it = engine.toScope({ locale: "it" });

    expect(it.locale).toBe("it");
    expect(it.t("login_button")).toBe("Accedi");
    expect(it.t("welcome", { name: "Ada" })).toBe("Benvenuto Ada!");
  });

  it("supports destructuring t and set from locale-bound scopes", () => {
    const { t, set } = engine.toScope().forLocale("en");

    expect(t("login_button")).toBe("Login");
    set("login_button", "Sign in");
    expect(t("login_button")).toBe("Sign in");
  });

  it("throws when key or locale is missing", () => {
    expect(() => view.t("login_button", "fr" as unknown as LocaleOfSingle<SingleSchema>)).toThrow(
      '[i18n] Missing key or locale: "login_button" [fr] (fallback chain: fr)'
    );
    expect(() => view.t("missing_key" as "login_button", "en")).toThrow(
      '[i18n] Missing key or locale: "missing_key" [en] (fallback chain: en)'
    );
  });

  describe("locale fallback", () => {
    const fallbackMap = {
      en: null,
      "de-DE": "en",
      "de-CH": "de-DE",
      it: "en",
    } as const;

    const fallbackEngine = new IcuTranslationProviderSingle<
      SingleSchema,
      SingleParams,
      keyof typeof fallbackMap | LocaleOfSingle<SingleSchema>,
      typeof fallbackMap
    >(singleDictionary, { localeFallback: fallbackMap });
    const fallbackView = fallbackEngine.toScope();

    it("resolves a locale through the fallback chain", () => {
      expect(fallbackView.t("login_button", "de-CH")).toBe("Login");
    });
  });

  describe("onMissing", () => {
    it('returns the key itself with onMissing: "key"', () => {
      const local = new IcuTranslationProviderSingle<SingleSchema, SingleParams>(singleDictionary, {
        onMissing: "key",
      });
      expect(local.toScope().t("missing_key" as "login_button", "en")).toBe("missing_key");
    });

    it("applies onMissing through forLocale wrappers", () => {
      const local = new IcuTranslationProviderSingle<SingleSchema, SingleParams>(singleDictionary, {
        onMissing: "key",
      });
      expect(
        local
          .toScope()
          .forLocale("en")
          .t("missing_key" as "login_button")
      ).toBe("missing_key");
    });
  });

  describe("set()", () => {
    it("patches a preloaded key after load merge", () => {
      const local = new IcuTranslationProviderSingle<SingleSchema, SingleParams>({
        login_button: { en: "Login", it: "Accedi" },
        welcome: { en: "Welcome {name}!", it: "benvenuto {name}..." },
        empty_label: { en: "" },
        broken: { en: "Hi {name" },
        invoice_count: singleDictionary.invoice_count,
        dashboard_status: singleDictionary.dashboard_status,
        inbox_owner: singleDictionary.inbox_owner,
        ranking_position: singleDictionary.ranking_position,
        account_balance: singleDictionary.account_balance,
        appointment_summary: singleDictionary.appointment_summary,
      });
      local.applyLoadMergeSingle({
        welcome: { it: "Benvenuto {name}!" },
      });

      const enScope = local.toScope().forLocale("en");
      enScope.set("login_button", "Sign in");

      const itScope = local.toScope().forLocale("it");

      expect(enScope.t("login_button")).toBe("Sign in");
      expect(itScope.t("login_button")).toBe("Accedi");

      expect(itScope.t("welcome", { name: "Mario" })).toBe("Benvenuto Mario!");
    });

    it("throws when patching a key that was not preloaded", () => {
      const local = new IcuTranslationProviderSingle<SingleSchema, SingleParams>({
        // @ts-expect-error missing it
        login_button: { en: "Login" },
        welcome: { en: "Welcome {name}!", it: "" },
        empty_label: { en: "" },
        broken: { en: "Hi {name" },
        invoice_count: singleDictionary.invoice_count,
        dashboard_status: singleDictionary.dashboard_status,
        inbox_owner: singleDictionary.inbox_owner,
        ranking_position: singleDictionary.ranking_position,
        account_balance: singleDictionary.account_balance,
        appointment_summary: singleDictionary.appointment_summary,
      });

      expect(() => local.toScope().forLocale("it").set("login_button", "Accedi")).toThrow(
        "[i18n] Key not preloaded: login_button (it)"
      );
    });

    it("invalidates compiled cache after set()", () => {
      const local = new IcuTranslationProviderSingle<SingleSchema, SingleParams>(singleDictionary);
      const en = local.toScope().forLocale("en");

      expect(en.t("welcome", { name: "Ada" })).toBe("Welcome Ada!");

      en.set("welcome", "Hi {name}!");

      expect(en.t("welcome", { name: "Ada" })).toBe("Hi Ada!");
    });

    it("throws on ICU args mismatch against other locales", () => {
      const local = new IcuTranslationProviderSingle<SingleSchema, SingleParams>(singleDictionary);
      const en = local.toScope().forLocale("en");

      expect(() => en.set("invoice_count", "{count, select, other {{count}}}")).toThrow(
        "[i18n] ICU args mismatch on patch:"
      );
    });
  });
});

describe("I18nScope multi", () => {
  const engine = new IcuTranslationProviderMulti<MultiSchema, MultiParams>(multiDictionary);

  it("translates with t(namespace, key, locale)", () => {
    const view = engine.toScope({ namespaces: ["default", "billing"] });

    expect(view.t("default", "login_button", "it")).toBe("Accedi");
    expect(view.t("default", "welcome", "en", { name: "Ada" })).toBe("Welcome Ada!");
    expect(view.t("billing", "invoice_summary", "en", { count: 3, name: "Ada" })).toBe(
      "You have 3 invoices for Ada"
    );
  });

  it("restricts namespaces at the type level", () => {
    const billingOnly = engine.toScope({ namespaces: ["billing"] });

    expect(billingOnly.t("billing", "invoice_summary", "en", { count: 1, name: "Ada" })).toBe(
      "You have 1 invoice for Ada"
    );
  });

  it("binds locale via forLocale", () => {
    const view = engine.toScope({ namespaces: ["default", "billing"] });
    const it = view.forLocale("it");

    expect(it.locale).toBe("it");
    expect(it.t("default", "login_button")).toBe("Accedi");
    expect(it.t("billing", "invoice_summary", { count: 2, name: "Ada" })).toBe(
      "Hai 2 fatture per Ada"
    );
  });

  it("binds locale via toScope({ namespaces, locale })", () => {
    const it = engine.toScope({ namespaces: ["billing"], locale: "it" });
    expect(it.locale).toBe("it");
    expect(it.t("billing", "invoice_summary", { count: 2, name: "Ada" })).toBe(
      "Hai 2 fatture per Ada"
    );
  });

  it("supports destructuring t and set from locale-bound scopes", () => {
    const { t, set } = engine.toScope({ namespaces: ["billing"] }).forLocale("en");

    expect(t("billing", "invoice_summary", { count: 1, name: "Ada" })).toBe(
      "You have 1 invoice for Ada"
    );
    set(
      "billing",
      "invoice_summary",
      "You have {count, plural, one {1 invoice only} other {{count} invoices only}} for {name}"
    );
    expect(t("billing", "invoice_summary", { count: 1, name: "Ada" })).toBe(
      "You have 1 invoice only for Ada"
    );
  });

  it("reflects partial applyLoadMergeNamespace via a fresh toScope", () => {
    const partial = new IcuTranslationProviderMulti<MultiSchema, MultiParams>({
      billing: {
        invoice_summary: {
          en: "You have {count, plural, one {1 invoice} other {{count} invoices}} for {name}",
        },
      },
    });

    partial.applyLoadMergeNamespace("billing", {
      invoice_summary: {
        it: "Hai {count, plural, one {1 fattura} other {{count} fatture}} per {name}",
      },
    });

    const view = partial.toScope({ namespaces: ["billing"], locale: "it" });
    expect(view.t("billing", "invoice_summary", { count: 2, name: "Bob" })).toBe(
      "Hai 2 fatture per Bob"
    );
  });

  it("degrades to onMissing for namespaces not in dictionary", () => {
    const partial = new IcuTranslationProviderMulti<MultiSchema, MultiParams>(
      { default: multiDictionary.default },
      { onMissing: "key" }
    );
    const view = partial.toScope({ namespaces: ["billing"], locale: "en" });

    expect(view.t("billing", "invoice_summary", { count: 1, name: "Ada" })).toBe(
      "billing.invoice_summary"
    );
  });

  describe("locale fallback", () => {
    const fallbackMap = {
      en: null,
      "de-DE": "en",
      "de-CH": "de-DE",
      it: "en",
    } as const;

    const fallbackEngine = new IcuTranslationProviderMulti<
      MultiSchema,
      MultiParams,
      keyof typeof fallbackMap | LocaleOfMulti<MultiSchema>,
      typeof fallbackMap
    >(multiDictionary, { localeFallback: fallbackMap });

    it("resolves a locale through the fallback chain", () => {
      const view = fallbackEngine.toScope({ namespaces: ["default"] });
      expect(view.t("default", "login_button", "de-CH")).toBe("Login");
    });
  });

  describe("set()", () => {
    it("patches a preloaded key after load merge", () => {
      const local = new IcuTranslationProviderMulti<MultiSchema, MultiParams>({
        billing: {
          invoice_summary: {
            en: "You have {count, plural, one {1 invoice} other {{count} invoices}} for {name}",
          },
        },
      });
      local.applyLoadMergeNamespace("billing", {
        invoice_summary: {
          it: "Hai {count, plural, one {1 fattura} other {{count} fatture}} per {name}",
        },
      });

      const en = local.toScope({ namespaces: ["billing"] }).forLocale("en");
      en.set(
        "billing",
        "invoice_summary",
        "You have {count, plural, one {1 invoice only} other {{count} invoices only}} for {name}"
      );

      expect(en.t("billing", "invoice_summary", { count: 1, name: "Ada" })).toBe(
        "You have 1 invoice only for Ada"
      );
      expect(
        local
          .toScope({ namespaces: ["billing"], locale: "it" })
          .t("billing", "invoice_summary", { count: 2, name: "Bob" })
      ).toBe("Hai 2 fatture per Bob");
    });

    it("throws when patching a key that was not preloaded", () => {
      const local = new IcuTranslationProviderMulti<MultiSchema, MultiParams>({
        billing: {
          invoice_summary: {
            en: "You have {count, plural, one {1 invoice} other {{count} invoices}} for {name}",
          },
        },
      });

      expect(() =>
        local
          .toScope({ namespaces: ["billing"] })
          .forLocale("it")
          .set(
            "billing",
            "invoice_summary",
            "Hai {count, plural, one {1 fattura} other {{count} fatture}} per {name}"
          )
      ).toThrow("[i18n] Key not preloaded: billing.invoice_summary (it)");
    });

    it("invalidates compiled cache after set()", () => {
      const local = new IcuTranslationProviderMulti<MultiSchema, MultiParams>(multiDictionary);
      const en = local.toScope({ namespaces: ["billing"] }).forLocale("en");

      expect(en.t("billing", "invoice_summary", { count: 2, name: "Bob" })).toBe(
        "You have 2 invoices for Bob"
      );

      en.set(
        "billing",
        "invoice_summary",
        "{count, plural, one {1 bill} other {{count} bills}} for {name}"
      );

      expect(en.t("billing", "invoice_summary", { count: 2, name: "Bob" })).toBe("2 bills for Bob");
    });

    it("throws on ICU args mismatch against other locales", () => {
      const local = new IcuTranslationProviderMulti<MultiSchema, MultiParams>(multiDictionary);
      const en = local.toScope({ namespaces: ["billing"] }).forLocale("en");

      expect(() =>
        en.set("billing", "invoice_summary", "{count, select, other {{count}}}")
      ).toThrow("[i18n] ICU args mismatch on patch:");
    });
  });
});
