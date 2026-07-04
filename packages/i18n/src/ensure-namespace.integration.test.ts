import { describe, expect, it } from "vitest";
import { ensureNamespacesLoadedImpl } from "./ensure-namespace.js";
import { IcuTranslationProviderMulti } from "./IcuTranslationProviderMulti.js";

type TestSchema = {
  default: {
    login_button: { en: string };
  };
  user: {
    greeting: { en: string };
  };
  billing: {
    invoice_summary: { en: string };
  };
};

type TestParams = {
  default: { login_button: never };
  user: { greeting: { name: string } };
  billing: { invoice_summary: { count: number } };
};

const namespaces: TestSchema = {
  default: { login_button: { en: "Login" } },
  user: { greeting: { en: "Hello {name}!" } },
  billing: {
    invoice_summary: {
      en: "You have {count, plural, one {1 invoice} other {{count} invoices}}",
    },
  },
};

describe("ensureNamespacesLoadedImpl integration", () => {
  it("mirrors the lazy codegen flow: partial init, preload batch, sync get", async () => {
    const i18n = new IcuTranslationProviderMulti<TestSchema, TestParams>({
      default: namespaces.default,
    });

    expect(i18n.hasNamespace("default")).toBe(true);
    expect(i18n.hasNamespace("user")).toBe(false);
    expect(i18n.hasNamespace("billing")).toBe(false);

    expect(i18n.get("default", "login_button", "en")).toBe("Login");

    expect(() => i18n.get("billing", "invoice_summary", "en", { count: 1 })).toThrow(
      'Namespace not loaded: "billing"'
    );

    await ensureNamespacesLoadedImpl(
      {
        provider: i18n,
        resolveLoader: (namespace) => async () => namespaces[namespace],
        validate: (_namespace, raw) => ({ ok: true, data: raw as TestSchema["billing"] }),
      },
      ["user", "billing"]
    );

    expect(i18n.get("user", "greeting", "en", { name: "Ada" })).toBe("Hello Ada!");
    expect(i18n.get("billing", "invoice_summary", "en", { count: 2 })).toBe("You have 2 invoices");

    i18n.setNamespace("billing", {
      invoice_summary: { en: "{count, plural, one {1 bill} other {{count} bills}}" },
    });
    expect(i18n.get("billing", "invoice_summary", "en", { count: 3 })).toBe("3 bills");
  });
});
