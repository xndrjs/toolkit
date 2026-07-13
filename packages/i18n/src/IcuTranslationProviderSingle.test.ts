import { describe, expect, it } from "vitest";
import { IcuTranslationProviderSingle } from "./IcuTranslationProviderSingle.js";

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
  const engine = new IcuTranslationProviderSingle<TestSchema, TestParams>(dictionary);

  it("replaces the dictionary and invalidates cache on setAll", () => {
    const local = new IcuTranslationProviderSingle<TestSchema, TestParams>(dictionary);
    expect(local.toView().t("login_button", "en")).toBe("Login");

    local.setAll({
      ...dictionary,
      login_button: { en: "Sign in", it: "Entra" },
    });

    expect(local.toView().t("login_button", "en")).toBe("Sign in");
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
      welcome: {
        // @ts-expect-error adding locale via merge
        it: "Benvenuto {name}!",
      },
    });

    const view = local.toView();
    expect(view.t("welcome", "en", { name: "Ada" })).toBe("Welcome Ada!");
    expect(view.t("welcome", "it", { name: "Ada" })).toBe("Benvenuto Ada!");
    expect(view.t("login_button", "en")).toBe("Login");
  });

  it("returns a deep-frozen snapshot from getAll", () => {
    expect(engine.getAll()).toEqual(dictionary);
    expect(engine.getAll()).not.toBe(dictionary);
    expect(Object.isFrozen(engine.getAll())).toBe(true);
  });

  it("does not mutate the engine when getAll snapshot is modified", () => {
    const snapshot = engine.getAll();
    expect(() => {
      snapshot.welcome.en = "Hacked";
    }).toThrow(TypeError);
    expect(engine.toView().t("welcome", "en", { name: "Ada" })).toBe("Welcome Ada!");
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
    expect(local.toView().t("login_button", "en")).toBe("Login");
  });

  describe("locale fallback", () => {
    it("rejects circular fallback maps at construction", () => {
      expect(
        () =>
          new IcuTranslationProviderSingle(dictionary, {
            localeFallback: { a: "b", b: "a" },
          })
      ).toThrow("[i18n] Circular locale fallback detected");
    });
  });
});
