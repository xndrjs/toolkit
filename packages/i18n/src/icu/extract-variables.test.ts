import { parse } from "@formatjs/icu-messageformat-parser";
import { describe, expect, it } from "vitest";
import {
  extractVariableMeta,
  inferMergedVariableType,
  mergeVariableMetaAcrossLocales,
  variableMetaToSpec,
  type VariableRole,
} from "./extract-variables.js";

function metaFor(template: string) {
  return extractVariableMeta(parse(template));
}

function mergeTemplates(...templates: string[]) {
  return mergeVariableMetaAcrossLocales(templates.map((template) => metaFor(template)));
}

function roles(...items: VariableRole[]) {
  return new Set(items);
}

describe("inferMergedVariableType", () => {
  describe("string family", () => {
    it.each<[VariableRole[], "string"]>([
      [["simple"], "string"],
      [["select"], "string"],
      [["simple", "select"], "string"],
    ])("accepts %j → %s", (items, expected) => {
      expect(inferMergedVariableType(roles(...items))).toBe(expected);
    });
  });

  describe("number family", () => {
    it.each<[VariableRole[], "number"]>([
      [["plural"], "number"],
      [["selectordinal"], "number"],
      [["number"], "number"],
      [["simple", "plural"], "number"],
      [["simple", "selectordinal"], "number"],
      [["simple", "number"], "number"],
      [["plural", "number"], "number"],
      [["selectordinal", "number"], "number"],
    ])("accepts %j → %s", (items, expected) => {
      expect(inferMergedVariableType(roles(...items))).toBe(expected);
    });
  });

  describe("date family", () => {
    it.each<[VariableRole[], "date"]>([
      [["date"], "date"],
      [["time"], "date"],
      [["date", "time"], "date"],
    ])("accepts %j → %s", (items, expected) => {
      expect(inferMergedVariableType(roles(...items))).toBe(expected);
    });
  });

  describe("conflicts", () => {
    it.each<{ label: string; roles: VariableRole[] }>([
      { label: "plural + select", roles: ["plural", "select"] },
      { label: "selectordinal + select", roles: ["selectordinal", "select"] },
      { label: "plural + selectordinal", roles: ["plural", "selectordinal"] },
      { label: "select + number", roles: ["select", "number"] },
      { label: "select + simple + number", roles: ["select", "simple", "number"] },
      { label: "plural + simple + select", roles: ["plural", "simple", "select"] },
      { label: "date + simple", roles: ["date", "simple"] },
      { label: "date + plural", roles: ["date", "plural"] },
      { label: "time + select", roles: ["time", "select"] },
      { label: "date + number", roles: ["date", "number"] },
    ])("rejects $label", ({ roles: roleList }) => {
      expect(inferMergedVariableType(roles(...roleList))).toBe("CONFLICT");
    });
  });
});

describe("mergeVariableMetaAcrossLocales", () => {
  describe("compatible cross-locale merges", () => {
    it("infers string for simple interpolation in every locale", () => {
      const result = mergeTemplates("Welcome {name}!", "Benvenuto {name}!");

      expect(result).toEqual({ ok: true, merged: { name: "string" } });
    });

    it("infers string when one locale uses select and another uses simple interpolation", () => {
      const result = mergeTemplates(
        "{gender, select, female {she} other {they}}",
        "Pronome: {gender}"
      );

      expect(result).toEqual({ ok: true, merged: { gender: "string" } });
      expect(variableMetaToSpec(metaFor("Pronome: {gender}"))).toEqual({ gender: "string" });
      expect(variableMetaToSpec(metaFor("{gender, select, other {x}}"))).toEqual({
        gender: "string",
      });
    });

    it("infers number when English uses plural and Italian uses simple interpolation", () => {
      const result = mergeTemplates(
        "You have {count, plural, one {1 invoice} other {# invoices}}",
        "Hai {count} fatture"
      );

      expect(result).toEqual({ ok: true, merged: { count: "number" } });
      expect(variableMetaToSpec(metaFor("Hai {count} fatture"))).toEqual({ count: "string" });
      expect(
        variableMetaToSpec(metaFor("You have {count, plural, one {1 invoice} other {# invoices}}"))
      ).toEqual({ count: "number" });
    });

    it("infers number when one locale uses selectordinal and another uses simple interpolation", () => {
      const result = mergeTemplates(
        "You finished {position, selectordinal, one {#st} other {#th}}",
        "Sei al {position} posto"
      );

      expect(result).toEqual({ ok: true, merged: { position: "number" } });
    });

    it("infers number when one locale uses plural and another uses number format", () => {
      const result = mergeTemplates(
        "{amount, plural, one {1} other {#}}",
        "Totale: {amount, number}"
      );

      expect(result).toEqual({ ok: true, merged: { amount: "number" } });
    });

    it("infers date when locales use date and time on the same variable", () => {
      const result = mergeTemplates("{due, date, short}", "{due, time, short}");

      expect(result).toEqual({ ok: true, merged: { due: "date" } });
    });
  });

  describe("incompatible cross-locale merges", () => {
    it("rejects plural and select on the same variable", () => {
      const result = mergeTemplates(
        "{myVar, select, other {x}}",
        "{myVar, plural, one {1} other {#}}"
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain('Incompatible ICU variable "myVar"');
      }
    });

    it("rejects plural and selectordinal on the same variable", () => {
      const result = mergeTemplates(
        "{rank, plural, one {1} other {#}}",
        "{rank, selectordinal, one {#st} other {#th}}"
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain('Incompatible ICU variable "rank"');
        expect(result.message).toContain("plural");
        expect(result.message).toContain("selectordinal");
      }
    });

    it("rejects select and number format on the same variable", () => {
      const result = mergeTemplates("{value, select, other {x}}", "Valore: {value, number}");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain('Incompatible ICU variable "value"');
      }
    });

    it("rejects date and simple interpolation on the same variable", () => {
      const result = mergeTemplates("{due, date, short}", "Scadenza {due}");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain('Incompatible ICU variable "due"');
      }
    });

    it("rejects different variable names across locales", () => {
      const result = mergeTemplates("Welcome {name}!", "Benvenuto {nome}!");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain("Inconsistent ICU variable names across locales");
      }
    });

    it("rejects when one locale omits a variable present in another", () => {
      const result = mergeTemplates("Welcome {name}!", "{name} and {count}");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain("Inconsistent ICU variable names across locales");
      }
    });
  });
});
