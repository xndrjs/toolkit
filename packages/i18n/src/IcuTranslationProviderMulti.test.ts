import { describe, expect, it } from "vitest";
import { IcuTranslationProviderMulti } from "./IcuTranslationProviderMulti.js";
import type { LocaleOfMulti } from "./types.js";

type TestSchema = {
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

type TestParams = {
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

const dictionary: TestSchema = {
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

describe("IcuTranslationProviderMulti", () => {
  const provider = new IcuTranslationProviderMulti<TestSchema, TestParams>(dictionary);

  it("resolves translations by namespace and key", () => {
    expect(provider.get("default", "login_button", "it")).toBe("Accedi");
    expect(provider.get("default", "welcome", "en", { name: "Ada" })).toBe("Welcome Ada!");
  });

  it("formats ICU plurals with multiple parameters", () => {
    expect(provider.get("billing", "invoice_summary", "en", { count: 1, name: "Ada" })).toBe(
      "You have 1 invoice for Ada"
    );
    expect(provider.get("billing", "invoice_summary", "en", { count: 3, name: "Ada" })).toBe(
      "You have 3 invoices for Ada"
    );
    expect(provider.get("billing", "invoice_summary", "it", { count: 1, name: "Ada" })).toBe(
      "Hai 1 fattura per Ada"
    );
    expect(provider.get("billing", "invoice_summary", "it", { count: 3, name: "Ada" })).toBe(
      "Hai 3 fatture per Ada"
    );
  });

  it("formats nested numeric plurals with double-brace references", () => {
    expect(provider.get("default", "dashboard_status", "en", { msgCount: 1, chatCount: 1 })).toBe(
      "You have 1 message in one chat"
    );
    expect(provider.get("default", "dashboard_status", "en", { msgCount: 3, chatCount: 2 })).toBe(
      "You have 3 messages in 2 chats"
    );
    expect(provider.get("default", "dashboard_status", "it", { msgCount: 1, chatCount: 1 })).toBe(
      "Hai 1 messaggio in una chat"
    );
    expect(provider.get("default", "dashboard_status", "it", { msgCount: 3, chatCount: 2 })).toBe(
      "Hai 3 messaggi in 2 chat"
    );
  });

  it("formats select and selectordinal ICU variants", () => {
    expect(provider.get("default", "inbox_owner", "en", { gender: "male", name: "Linus" })).toBe(
      "Linus owns his inbox"
    );
    expect(provider.get("default", "ranking_position", "en", { position: 3 })).toBe(
      "You finished 3rd"
    );
  });

  it("formats number, date, and time ICU variants", () => {
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

    expect(provider.get("billing", "account_balance", "en", { amount })).toBe(
      `Balance: ${expectedAmount}`
    );
    expect(
      provider.get("billing", "appointment_summary", "en", {
        dueDate: when,
        startTime: when,
      })
    ).toBe(`Due ${expectedDate} at ${expectedTime}`);
  });

  it("treats an empty string template as valid", () => {
    expect(provider.get("billing", "empty_label", "en")).toBe("");
  });

  it("throws when namespace, key, or locale is missing", () => {
    expect(() =>
      provider.get("default", "login_button", "fr" as unknown as LocaleOfMulti<TestSchema>)
    ).toThrow(
      '[i18n] Missing key or locale: namespace "default", key "login_button" [fr] (fallback chain: fr)'
    );
    expect(() => provider.get("billing", "login_button" as "empty_label", "en")).toThrow(
      '[i18n] Missing key or locale: namespace "billing", key "login_button" [en] (fallback chain: en)'
    );
  });

  it("throws when required parameters are missing", () => {
    expect(() => provider.get("billing", "invoice_summary", "en", { count: 1 } as never)).toThrow(
      "[i18n Formatting Error]"
    );
  });

  it("patches a single namespace with setNamespace and invalidates its cache", () => {
    const local = new IcuTranslationProviderMulti<TestSchema, TestParams>(dictionary);
    expect(local.get("billing", "invoice_summary", "en", { count: 2, name: "Bob" })).toBe(
      "You have 2 invoices for Bob"
    );

    local.setNamespace("billing", {
      ...dictionary.billing,
      invoice_summary: {
        en: "{count, plural, one {1 bill} other {{count} bills}}",
        it: dictionary.billing.invoice_summary.it,
      },
    });

    expect(local.get("billing", "invoice_summary", "en", { count: 2, name: "Bob" })).toBe(
      "2 bills"
    );
    expect(local.get("default", "login_button", "en")).toBe("Login");
  });

  it("replaces the full dictionary on setAll", () => {
    const local = new IcuTranslationProviderMulti<TestSchema, TestParams>(dictionary);

    local.setAll({
      ...dictionary,
      default: {
        ...dictionary.default,
        login_button: { en: "Sign in", it: "Entra" },
      },
    });

    expect(local.get("default", "login_button", "en")).toBe("Sign in");
  });

  describe("forLocale", () => {
    it("binds a locale so get() no longer requires it", () => {
      const it = provider.forLocale("it");

      expect(it.locale).toBe("it");
      expect(it.get("default", "login_button")).toBe("Accedi");
      expect(it.get("billing", "invoice_summary", { count: 2, name: "Ada" })).toBe(
        "Hai 2 fatture per Ada"
      );
    });
  });

  describe("locale fallback", () => {
    const fallbackMap = {
      en: null,
      "de-DE": "en",
      "de-CH": "de-DE",
      it: "en",
    } as const;

    const fallbackProvider = new IcuTranslationProviderMulti<
      TestSchema,
      TestParams,
      keyof typeof fallbackMap | LocaleOfMulti<TestSchema>,
      typeof fallbackMap
    >(dictionary, { localeFallback: fallbackMap });

    it("resolves a locale through the fallback chain", () => {
      expect(fallbackProvider.get("default", "login_button", "de-CH")).toBe("Login");
    });

    it("throws when the fallback chain cannot resolve a template", () => {
      const unresolvedFallback = {
        en: null,
        "de-CH": "fr",
        fr: null,
      } as const;
      const unresolvedProvider = new IcuTranslationProviderMulti<
        TestSchema,
        TestParams,
        keyof typeof unresolvedFallback | LocaleOfMulti<TestSchema>,
        typeof unresolvedFallback
      >(dictionary, { localeFallback: unresolvedFallback });

      expect(() => unresolvedProvider.get("default", "login_button", "de-CH")).toThrow(
        '[i18n] Missing key or locale: namespace "default", key "login_button" [de-CH] (fallback chain: de-CH → fr)'
      );
    });
  });
});
