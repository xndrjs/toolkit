import { describe, expect, it } from "vitest";
import {
  buildDictionarySpecFromAnalysis,
  namespaceContractsMatch,
} from "./dictionary-spec-contract.js";

describe("dictionary-spec-contract", () => {
  it("namespaceContractsMatch compares keys and VariableSpec", () => {
    const entries = [{ namespace: "default", filePath: "translations/default.json" }];
    const current = buildDictionarySpecFromAnalysis(entries, {
      default: { welcome: { name: "string" }, login: {} },
    });
    const established = buildDictionarySpecFromAnalysis(entries, {
      default: { welcome: { name: "string" }, login: {} },
    });
    expect(namespaceContractsMatch(["default"], current, established)).toBe(true);

    const changedArgs = buildDictionarySpecFromAnalysis(entries, {
      default: { welcome: { name: "string", extra: "string" }, login: {} },
    });
    expect(namespaceContractsMatch(["default"], changedArgs, established)).toBe(false);

    const changedKeys = buildDictionarySpecFromAnalysis(entries, {
      default: { welcome: { name: "string" } },
    });
    expect(namespaceContractsMatch(["default"], changedKeys, established)).toBe(false);
  });
});
