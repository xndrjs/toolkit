import { describe, expect, it } from "vitest";
import { cloneAndFreeze, deepFreeze } from "./deep-freeze.js";

describe("deepFreeze", () => {
  it("freezes nested objects", () => {
    const value = { welcome: { en: "Hello" } };
    deepFreeze(value);

    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.welcome)).toBe(true);
    expect(() => {
      value.welcome.en = "Hacked";
    }).toThrow(TypeError);
  });
});

describe("cloneAndFreeze", () => {
  it("returns a deep-frozen clone", () => {
    const source = { welcome: { en: "Hello" } };
    const snapshot = cloneAndFreeze(source);

    expect(snapshot).toEqual(source);
    expect(snapshot).not.toBe(source);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.welcome)).toBe(true);
  });
});
