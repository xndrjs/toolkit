import { describe, expect, it } from "vitest";
import { IcuTranslationProviderMulti } from "./IcuTranslationProviderMulti.js";

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
  const engine = new IcuTranslationProviderMulti<TestSchema, TestParams>(dictionary);

  it("tracks namespaces via dictionary keys", () => {
    const partial = new IcuTranslationProviderMulti<TestSchema, TestParams>({
      default: dictionary.default,
    });

    expect("default" in partial.getAll()).toBe(true);
    expect("billing" in partial.getAll()).toBe(false);
  });

  it("supports partial initialization", () => {
    const partial = new IcuTranslationProviderMulti<TestSchema, TestParams>({
      default: dictionary.default,
    });

    expect(partial.toView({ namespaces: ["default"] }).t("default", "login_button", "en")).toBe(
      "Login"
    );
  });

  it("patches a single namespace with setNamespace and invalidates its cache", () => {
    const local = new IcuTranslationProviderMulti<TestSchema, TestParams>(dictionary);
    const view = () => local.toView({ namespaces: ["default", "billing"] });

    expect(view().t("billing", "invoice_summary", "en", { count: 2, name: "Bob" })).toBe(
      "You have 2 invoices for Bob"
    );

    local.setNamespace("billing", {
      ...dictionary.billing,
      invoice_summary: {
        en: "{count, plural, one {1 bill} other {{count} bills}}",
        it: dictionary.billing.invoice_summary.it,
      },
    });

    expect(view().t("billing", "invoice_summary", "en", { count: 2, name: "Bob" })).toBe("2 bills");
    expect(view().t("default", "login_button", "en")).toBe("Login");
  });

  it("adds namespace to dictionary with setNamespace", () => {
    const partial = new IcuTranslationProviderMulti<TestSchema, TestParams>({
      default: dictionary.default,
    });
    expect("billing" in partial.getAll()).toBe(false);

    partial.setNamespace("billing", dictionary.billing);
    expect("billing" in partial.getAll()).toBe(true);
  });

  it("adds namespace to dictionary on first mergeNamespace", () => {
    const partial = new IcuTranslationProviderMulti<TestSchema, TestParams>({});
    expect("billing" in partial.getAll()).toBe(false);

    partial.mergeNamespace("billing", dictionary.billing);
    expect("billing" in partial.getAll()).toBe(true);
  });

  it("accumulates a locale via mergeNamespace when the namespace already exists", () => {
    const local = new IcuTranslationProviderMulti<TestSchema, TestParams>({
      billing: {
        invoice_summary: {
          en: "You have {count, plural, one {1 invoice} other {{count} invoices}} for {name}",
        },
      },
    });
    const view = () => local.toView({ namespaces: ["billing"] });

    expect("billing" in local.getAll()).toBe(true);
    expect(view().t("billing", "invoice_summary", "en", { count: 1, name: "Ada" })).toBe(
      "You have 1 invoice for Ada"
    );

    local.mergeNamespace("billing", {
      invoice_summary: {
        it: "Hai {count, plural, one {1 fattura} other {{count} fatture}} per {name}",
      },
    });

    expect(view().t("billing", "invoice_summary", "en", { count: 2, name: "Bob" })).toBe(
      "You have 2 invoices for Bob"
    );
    expect(view().t("billing", "invoice_summary", "it", { count: 2, name: "Bob" })).toBe(
      "Hai 2 fatture per Bob"
    );
  });

  it("merges locales per key with mergeNamespace without dropping existing locales", () => {
    const local = new IcuTranslationProviderMulti<TestSchema, TestParams>({
      billing: {
        invoice_summary: {
          en: "You have {count, plural, one {1 invoice} other {{count} invoices}} for {name}",
        },
      },
    });
    const view = () => local.toView({ namespaces: ["billing"] });

    local.mergeNamespace("billing", {
      invoice_summary: {
        it: "Hai {count, plural, one {1 fattura} other {{count} fatture}} per {name}",
      },
    });

    expect(view().t("billing", "invoice_summary", "en", { count: 2, name: "Bob" })).toBe(
      "You have 2 invoices for Bob"
    );
    expect(view().t("billing", "invoice_summary", "it", { count: 2, name: "Bob" })).toBe(
      "Hai 2 fatture per Bob"
    );
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

    expect(local.toView({ namespaces: ["default"] }).t("default", "login_button", "en")).toBe(
      "Sign in"
    );
  });

  it("merges namespaces with mergeAll without dropping existing locales", () => {
    const local = new IcuTranslationProviderMulti<TestSchema, TestParams>({
      billing: {
        invoice_summary: {
          en: "You have {count, plural, one {1 invoice} other {{count} invoices}} for {name}",
        },
      },
    });
    const view = () => local.toView({ namespaces: ["default", "billing"] });

    local.mergeAll({
      billing: {
        invoice_summary: {
          it: "Hai {count, plural, one {1 fattura} other {{count} fatture}} per {name}",
        },
      },
      default: dictionary.default,
    });

    expect(view().t("billing", "invoice_summary", "en", { count: 2, name: "Bob" })).toBe(
      "You have 2 invoices for Bob"
    );
    expect(view().t("billing", "invoice_summary", "it", { count: 2, name: "Bob" })).toBe(
      "Hai 2 fatture per Bob"
    );
    expect(view().t("default", "login_button", "en")).toBe("Login");
  });

  it("returns a deep-frozen snapshot from getAll", () => {
    expect(engine.getAll()).toEqual(dictionary);
    expect(engine.getAll()).not.toBe(dictionary);
    expect(Object.isFrozen(engine.getAll().default)).toBe(true);
  });

  it("does not mutate the engine when getAll snapshot is modified", () => {
    const snapshot = engine.getAll();
    expect(() => {
      snapshot.default.login_button.en = "Hacked";
    }).toThrow(TypeError);
    expect(engine.toView({ namespaces: ["default"] }).t("default", "login_button", "en")).toBe(
      "Login"
    );
  });
});
