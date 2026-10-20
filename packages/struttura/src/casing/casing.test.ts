import { describe, expect, it } from "vitest";

import {
  toCamelCase,
  toKebabCase,
  toPascalCase,
  toSentenceCase,
  toSnakeCase,
  toTitleCase,
  words,
} from "./casing";

describe("casing", () => {
  it("splits camel, pascal, kebab, snake, and spaced input into words", () => {
    expect(words("oneBigDog")).toEqual(["one", "big", "dog"]);
    expect(words("OneBigDog")).toEqual(["one", "big", "dog"]);
    expect(words("one-big-dog")).toEqual(["one", "big", "dog"]);
    expect(words("one_big_dog")).toEqual(["one", "big", "dog"]);
    expect(words("one big dog")).toEqual(["one", "big", "dog"]);
    expect(words("XMLHttpRequest")).toEqual(["xml", "http", "request"]);
  });

  it("converts to each target casing from mixed inputs", () => {
    const samples = ["oneBigDog", "OneBigDog", "one-big-dog", "one_big_dog", "one big dog"];

    for (const sample of samples) {
      expect(toPascalCase(sample)).toBe("OneBigDog");
      expect(toKebabCase(sample)).toBe("one-big-dog");
      expect(toSnakeCase(sample)).toBe("one_big_dog");
      expect(toCamelCase(sample)).toBe("oneBigDog");
      expect(toTitleCase(sample)).toBe("One Big Dog");
      expect(toSentenceCase(sample)).toBe("One big dog");
    }
  });

  it("returns empty string for empty or separator-only input", () => {
    expect(toPascalCase("")).toBe("");
    expect(toKebabCase("---")).toBe("");
    expect(toCamelCase("___")).toBe("");
    expect(toTitleCase("   ")).toBe("");
    expect(toSentenceCase("")).toBe("");
  });
});
