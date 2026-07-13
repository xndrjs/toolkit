import { describe, expect, it } from "vitest";
import type { DictionarySpec } from "./types.js";
import { normalizeDictionary, normalizeKeyDictionaryPartial } from "./normalize.js";
import { validateNormalizedDictionary } from "./validate-normalized.js";
import { toDictionary } from "./to-dictionary.js";
import {
  validateExternalDictionaryPartial,
  validateExternalKey,
  validateExternalNamespacePartial,
} from "./index.js";

const spec: DictionarySpec = {
  mode: "single",
  requiredKeys: ["login_button", "welcome", "invoice_count"],
  argsByKey: {
    login_button: {},
    welcome: { name: "string" },
    invoice_count: { count: "number" },
  },
};

const validInput = {
  login_button: { en: "Login", it: "Accedi" },
  welcome: { en: "Welcome {name}!", it: "Benvenuto {name}!" },
  invoice_count: {
    en: "You have {count, plural, one {1 invoice} other {{count} invoices}}",
  },
};

describe("normalizeDictionary", () => {
  it("rejects non-object input", () => {
    const result = normalizeDictionary(null, spec);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.kind).toBe("invalid_input");
    }
  });

  it("rejects missing required keys", () => {
    const result = normalizeDictionary({ login_button: { en: "Login" } }, spec);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.kind === "missing_key")).toBe(true);
    }
  });

  it("ignores extra keys", () => {
    const result = normalizeDictionary({ ...validInput, extra_key: { en: "Extra" } }, spec);
    expect(result.ok).toBe(true);
  });

  it("accepts partial locales", () => {
    const result = normalizeDictionary(
      {
        login_button: { en: "Login" },
        welcome: { en: "Welcome {name}!" },
        invoice_count: { en: "You have {count, plural, one {1} other {{count}}}" },
      },
      spec
    );
    expect(result.ok).toBe(true);
    if (result.ok && result.data.mode === "single") {
      expect(Object.keys(result.data.keys.login_button!.locales)).toEqual(["en"]);
    }
  });

  it("rejects ICU syntax errors", () => {
    const result = normalizeDictionary(
      {
        ...validInput,
        welcome: { en: "Hi {name" },
      },
      spec
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.kind).toBe("icu_syntax_error");
    }
  });

  it("rejects inconsistent args across locales", () => {
    const result = normalizeDictionary(
      {
        ...validInput,
        welcome: { en: "Welcome {name}!", it: "Benvenuto {nome}!" },
      },
      spec
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.kind).toBe("locale_args_mismatch");
    }
  });

  it("accepts plural in one locale and simple interpolation in another for the same variable", () => {
    const result = normalizeDictionary(
      {
        login_button: { en: "Login" },
        welcome: { en: "Welcome {name}!" },
        invoice_count: {
          en: "You have {count, plural, one {1 invoice} other {# invoices}}",
          it: "Hai {count} fatture",
        },
      },
      spec
    );

    expect(result.ok).toBe(true);
    if (result.ok && result.data.mode === "single") {
      expect(result.data.keys.invoice_count?.mergedArgs).toEqual({ count: "number" });
    }
  });

  it("rejects plural and select on the same variable across locales", () => {
    const result = normalizeDictionary(
      {
        login_button: { en: "Login" },
        welcome: { en: "Welcome {name}!" },
        invoice_count: {
          en: "{count, select, other {{count}}}",
          it: "{count, plural, one {1} other {#}}",
        },
      },
      spec
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.kind === "locale_args_mismatch")).toBe(true);
    }
  });

  it("rejects plural and selectordinal on the same variable across locales", () => {
    const result = normalizeDictionary(
      {
        login_button: { en: "Login" },
        welcome: { en: "Welcome {name}!" },
        invoice_count: {
          en: "{count, plural, one {1} other {#}}",
          it: "{count, selectordinal, one {#°} other {#°}}",
        },
      },
      spec
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.kind === "locale_args_mismatch")).toBe(true);
    }
  });

  it("rejects select and number format on the same variable across locales", () => {
    const result = normalizeDictionary(
      {
        login_button: { en: "Login" },
        welcome: { en: "Welcome {name}!" },
        invoice_count: {
          en: "{count, select, other {x}}",
          it: "{count, number}",
        },
      },
      spec
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.kind === "locale_args_mismatch")).toBe(true);
    }
  });

  it("accepts select in one locale and simple interpolation in another", () => {
    const result = normalizeDictionary(
      {
        login_button: { en: "Login" },
        welcome: {
          en: "{gender, select, female {she} other {they}}",
          it: "Pronome: {gender}",
        },
        invoice_count: {
          en: "You have {count, plural, one {1 invoice} other {# invoices}}",
        },
      },
      {
        ...spec,
        requiredKeys: ["login_button", "welcome", "invoice_count"],
        argsByKey: {
          ...spec.argsByKey,
          welcome: { gender: "string" },
        },
      }
    );

    expect(result.ok).toBe(true);
    if (result.ok && result.data.mode === "single") {
      expect(result.data.keys.welcome?.mergedArgs).toEqual({ gender: "string" });
    }
  });
});

describe("validateNormalizedDictionary", () => {
  it("accepts matching merged args", () => {
    const normalized = normalizeDictionary(validInput, spec);
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;

    const result = validateNormalizedDictionary(normalized.data, spec);
    expect(result.ok).toBe(true);
  });

  it("rejects variable mismatch vs spec", () => {
    const normalized = normalizeDictionary(
      {
        login_button: { en: "Login" },
        welcome: { en: "Welcome {name}!" },
        invoice_count: {
          en: "You have {total, plural, one {1} other {{total}}}",
        },
      },
      spec
    );
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;

    const result = validateNormalizedDictionary(normalized.data, spec);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some(
          (i) => i.kind === "variable_mismatch" || i.kind === "variable_type_mismatch"
        )
      ).toBe(true);
    }
  });
});

describe("ICU variant argument extraction", () => {
  const variantSpec: DictionarySpec = {
    mode: "single",
    requiredKeys: ["inbox_owner", "ranking_position", "account_balance", "appointment_summary"],
    argsByKey: {
      inbox_owner: { gender: "string", name: "string" },
      ranking_position: { position: "number" },
      account_balance: { amount: "number" },
      appointment_summary: { dueDate: "date", startTime: "date" },
    },
  };

  const variantInput = {
    inbox_owner: {
      en: "{gender, select, female {{name} owns her inbox} male {{name} owns his inbox} other {{name} owns their inbox}}",
    },
    ranking_position: {
      en: "You finished {position, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}",
    },
    account_balance: {
      en: "Balance: {amount, number, ::currency/EUR}",
    },
    appointment_summary: {
      en: "Due {dueDate, date, short} at {startTime, time, short}",
    },
  };

  it("normalizes select, selectordinal, number, date, and time arguments", () => {
    const normalized = normalizeDictionary(variantInput, variantSpec);
    expect(normalized.ok).toBe(true);
    if (!normalized.ok || normalized.data.mode !== "single") return;

    expect(normalized.data.keys.inbox_owner?.mergedArgs).toEqual({
      gender: "string",
      name: "string",
    });
    expect(normalized.data.keys.ranking_position?.mergedArgs).toEqual({
      position: "number",
    });
    expect(normalized.data.keys.account_balance?.mergedArgs).toEqual({
      amount: "number",
    });
    expect(normalized.data.keys.appointment_summary?.mergedArgs).toEqual({
      dueDate: "date",
      startTime: "date",
    });
  });

  it("validates ICU variant args against the generated spec", () => {
    const normalized = normalizeDictionary(variantInput, variantSpec);
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;

    const result = validateNormalizedDictionary(normalized.data, variantSpec);
    expect(result.ok).toBe(true);
  });
});

describe("toDictionary", () => {
  it("reconstructs key-locale-template shape", () => {
    const normalized = normalizeDictionary(validInput, spec);
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;

    const dictionary = toDictionary(normalized.data);
    expect(dictionary).toEqual({
      login_button: { en: "Login", it: "Accedi" },
      welcome: { en: "Welcome {name}!", it: "Benvenuto {name}!" },
      invoice_count: {
        en: "You have {count, plural, one {1 invoice} other {{count} invoices}}",
      },
    });
  });
});

describe("validateExternalDictionaryPartial", () => {
  it("validates end-to-end with full snapshot payload", () => {
    const result = validateExternalDictionaryPartial<typeof validInput>(validInput, spec);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.data as typeof validInput).login_button.en).toBe("Login");
    }
  });

  it("accepts partial payload with one of N keys", () => {
    const result = validateExternalDictionaryPartial({ login_button: { en: "Login" } }, spec);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.data)).toEqual(["login_button"]);
    }
  });

  it("accepts empty payload", () => {
    const result = validateExternalDictionaryPartial({}, spec);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({});
    }
  });

  it("rejects unknown keys", () => {
    const result = validateExternalDictionaryPartial(
      { login_button: { en: "Login" }, typo_key: { en: "Oops" } },
      spec
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.kind === "unknown_key")).toBe(true);
    }
  });

  it("rejects ICU errors on partial keys", () => {
    const result = validateExternalDictionaryPartial({ welcome: { en: "Hi {name" } }, spec);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.kind).toBe("icu_syntax_error");
    }
  });
});

describe("validateExternalKey (single)", () => {
  it("validates a single key and returns Pick type data", () => {
    const result = validateExternalKey<{ welcome: (typeof validInput)["welcome"] }>(
      "welcome",
      { en: "Welcome {name}!" },
      spec
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.welcome.en).toBe("Welcome {name}!");
    }
  });

  it("rejects unknown keys", () => {
    const result = validateExternalKey("typo_key", { en: "Oops" }, spec);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.kind).toBe("unknown_key");
    }
  });
});

describe("normalizeKeyDictionaryPartial", () => {
  it("accepts one of N keys without missing_key errors", () => {
    const result = normalizeKeyDictionaryPartial(
      { login_button: { en: "Login" } },
      spec.requiredKeys,
      spec.argsByKey,
      []
    );
    expect(result.ok).toBe(true);
  });

  it("rejects keys with zero locales", () => {
    const result = normalizeKeyDictionaryPartial(
      { login_button: {} },
      spec.requiredKeys,
      spec.argsByKey,
      []
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.kind).toBe("invalid_input");
    }
  });
});

describe("normalizeDictionary multi mode", () => {
  const multiSpec: DictionarySpec = {
    mode: "multi",
    requiredKeys: {
      default: ["welcome"],
      billing: ["invoice_summary"],
    },
    argsByKey: {
      default: { welcome: { name: "string" } },
      billing: { invoice_summary: { count: "number" } },
    },
  };

  it("validates namespace structure", () => {
    const result = normalizeDictionary(
      {
        default: { welcome: { en: "Welcome {name}!" } },
        billing: {
          invoice_summary: {
            en: "You have {count, plural, one {1} other {{count}}}",
          },
        },
      },
      multiSpec
    );
    expect(result.ok).toBe(true);
  });

  it("reports missing keys with namespace path", () => {
    const result = normalizeDictionary(
      {
        default: { welcome: { en: "Welcome {name}!" } },
      },
      multiSpec
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some(
          (i) =>
            i.kind === "missing_key" &&
            "path" in i &&
            i.path.join(".") === "billing.invoice_summary"
        )
      ).toBe(true);
    }
  });
});

describe("validateExternalNamespacePartial", () => {
  const multiSpec: DictionarySpec = {
    mode: "multi",
    requiredKeys: {
      default: ["welcome"],
      billing: ["invoice_summary"],
    },
    argsByKey: {
      default: { welcome: { name: "string" } },
      billing: { invoice_summary: { count: "number" } },
    },
  };

  it("accepts one of N keys in a namespace", () => {
    const result = validateExternalNamespacePartial(
      "billing",
      {
        invoice_summary: {
          en: "You have {count, plural, one {1} other {{count}}}",
        },
      },
      multiSpec
    );
    expect(result.ok).toBe(true);
  });

  it("does not error when contract keys are absent from payload", () => {
    const result = validateExternalNamespacePartial("billing", {}, multiSpec);
    expect(result.ok).toBe(true);
  });

  it("validates full CMS snapshot when all keys are in payload", () => {
    const result = validateExternalNamespacePartial(
      "billing",
      {
        invoice_summary: {
          en: "You have {count, plural, one {1} other {{count}}}",
        },
      },
      multiSpec
    );
    expect(result.ok).toBe(true);
  });

  it("rejects unknown keys in namespace payload", () => {
    const result = validateExternalNamespacePartial(
      "billing",
      { typo_key: { en: "Oops" } },
      multiSpec
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.kind).toBe("unknown_key");
    }
  });
});

describe("validateExternalKey (multi)", () => {
  const multiSpec: DictionarySpec = {
    mode: "multi",
    requiredKeys: {
      billing: ["invoice_summary"],
    },
    argsByKey: {
      billing: { invoice_summary: { count: "number" } },
    },
  };

  it("validates a single key in a namespace", () => {
    const result = validateExternalKey(
      "billing",
      "invoice_summary",
      { en: "You have {count, plural, one {1} other {{count}}}" },
      multiSpec
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.invoice_summary.en).toContain("{count");
    }
  });
});

describe("validateExternalDictionaryPartial (multi)", () => {
  const multiSpec: DictionarySpec = {
    mode: "multi",
    requiredKeys: {
      default: ["welcome"],
      billing: ["invoice_summary"],
    },
    argsByKey: {
      default: { welcome: { name: "string" } },
      billing: { invoice_summary: { count: "number" } },
    },
  };

  it("accepts partial namespaces", () => {
    const result = validateExternalDictionaryPartial(
      {
        billing: {
          invoice_summary: {
            en: "You have {count, plural, one {1} other {{count}}}",
          },
        },
      },
      multiSpec
    );
    expect(result.ok).toBe(true);
  });
});
