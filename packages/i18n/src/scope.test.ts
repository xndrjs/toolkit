import { describe, expect, it } from "vitest";
import { IcuTranslationProviderMulti } from "./IcuTranslationProviderMulti.js";
import type { LocaleOfMulti } from "./types.js";

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

  it("supports destructuring t from locale-bound scopes", () => {
    const { t } = engine.toScope({ namespaces: ["billing"] }).forLocale("en");

    expect(t("billing", "invoice_summary", { count: 1, name: "Ada" })).toBe(
      "You have 1 invoice for Ada"
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
});
