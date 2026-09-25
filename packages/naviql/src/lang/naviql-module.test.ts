import { describe, expect, it } from "vitest";
import { createNaviQlServices } from "./naviql-module.js";

describe("NaviQl Langium scaffold", () => {
  it("creates services and parses a stub document", () => {
    const { NaviQl } = createNaviQlServices();
    const result = NaviQl.parser.LangiumParser.parse("placeholder Hello;");
    expect(result.parserErrors).toEqual([]);
    expect(result.lexerErrors).toEqual([]);
    expect(result.value.$type).toBe("Model");
  });
});
