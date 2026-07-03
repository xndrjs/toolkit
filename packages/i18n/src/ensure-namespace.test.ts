import { describe, expect, it, vi } from "vitest";
import { ensureNamespacesLoadedImpl } from "./ensure-namespace.js";
import { IcuTranslationProviderMulti } from "./IcuTranslationProviderMulti.js";
import type { ValidationResult } from "./validation/types.js";

type TestSchema = {
  default: {
    hello: { en: string };
  };
  billing: {
    invoice: { en: string };
  };
};

type TestParams = {
  default: { hello: never };
  billing: { invoice: never };
};

const defaultNs: TestSchema["default"] = { hello: { en: "Hello" } };
const billingNs: TestSchema["billing"] = { invoice: { en: "Invoice" } };

function createProvider(initial: Partial<TestSchema> = { default: defaultNs }) {
  return new IcuTranslationProviderMulti<TestSchema, TestParams>(initial);
}

describe("ensureNamespacesLoadedImpl", () => {
  it("is a noop for an empty namespaces array", async () => {
    const provider = createProvider();
    const load = vi.fn();

    await ensureNamespacesLoadedImpl(
      {
        provider,
        resolveLoader: () => load,
        validate: () => ({ ok: true, data: billingNs }),
      },
      []
    );

    expect(load).not.toHaveBeenCalled();
  });

  it("is a noop when the namespace is already loaded", async () => {
    const provider = createProvider({ default: defaultNs, billing: billingNs });
    const load = vi.fn();

    await ensureNamespacesLoadedImpl(
      {
        provider,
        resolveLoader: () => load,
        validate: () => ({ ok: true, data: billingNs }),
      },
      ["billing"]
    );

    expect(load).not.toHaveBeenCalled();
  });

  it("loads multiple namespaces in parallel", async () => {
    const provider = createProvider();
    const loadBilling = vi.fn(async () => billingNs);
    const loadDefault = vi.fn(async () => defaultNs);

    await ensureNamespacesLoadedImpl(
      {
        provider,
        resolveLoader: (namespace) => (namespace === "billing" ? loadBilling : loadDefault),
        validate: (_namespace, raw) => ({ ok: true, data: raw as TestSchema["billing"] }),
      },
      ["billing"]
    );

    expect(loadBilling).toHaveBeenCalledTimes(1);
    expect(provider.hasNamespace("billing")).toBe(true);
    expect(provider.get("billing", "invoice", "en")).toBe("Invoice");
  });

  it("dedupes concurrent requests for the same namespace", async () => {
    const provider = createProvider();
    let resolveLoad!: () => void;
    const load = vi.fn(
      () =>
        new Promise<TestSchema["billing"]>((resolve) => {
          resolveLoad = () => resolve(billingNs);
        })
    );

    const options = {
      provider,
      resolveLoader: () => load,
      validate: () => ({ ok: true, data: billingNs }),
    };

    const first = ensureNamespacesLoadedImpl(options, ["billing"]);
    const second = ensureNamespacesLoadedImpl(options, ["billing"]);

    resolveLoad();
    await Promise.all([first, second]);

    expect(load).toHaveBeenCalledTimes(1);
    expect(provider.hasNamespace("billing")).toBe(true);
  });

  it("propagates validation failures without marking the namespace loaded", async () => {
    const provider = createProvider();
    const failed: ValidationResult<TestSchema["billing"]> = {
      ok: false,
      issues: [{ kind: "invalid_input", message: "bad data" }],
    };

    await expect(
      ensureNamespacesLoadedImpl(
        {
          provider,
          resolveLoader: () => async () => ({ bad: true }),
          validate: () => failed,
        },
        ["billing"]
      )
    ).rejects.toThrow("bad data");

    expect(provider.hasNamespace("billing")).toBe(false);
  });
});
