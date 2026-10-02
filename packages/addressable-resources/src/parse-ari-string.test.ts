import { describe, expect, it } from "vitest";

import { createAri } from "./create-ari";
import { formatAriString } from "./format-ari-string";
import { parseAriString, safeParseAriString } from "./parse-ari-string";

describe("parseAriString / formatAriString", () => {
  it("round-trips createAri resources", () => {
    const cases = [
      createAri("task-permissions", { taskId: "task-123", userId: "user-456" }),
      createAri("task-permissions", { b: 2, a: 1 }),
      createAri("task-permissions", { taskId: "task-123", userId: null }),
      createAri("tasks", {}),
      createAri("count", { n: 42 }),
      createAri("flag", { on: true }),
      createAri("integration.product", { sku: "TSHIRT-1" }),
    ];

    for (const resource of cases) {
      const wire = resource.toString();
      expect(parseAriString(wire)).toEqual({
        type: resource.type,
        key: resource.key,
      });
      expect(formatAriString(resource.type, resource.key)).toBe(wire);
    }
  });

  it("uses lexicographic field order", () => {
    expect(formatAriString("Page", { slug: "about", locale: "en" })).toBe(
      'Page(locale="en",slug="about")'
    );
  });

  it("escapes strings via JSON.stringify", () => {
    const wire = formatAriString("page", { url: 'http://example.com?q="x"' });
    expect(wire).toBe('page(url="http://example.com?q=\\"x\\"")');
    expect(parseAriString(wire)).toEqual({
      type: "page",
      key: { url: 'http://example.com?q="x"' },
    });
  });

  it("parses commas and equals inside string values", () => {
    const wire = formatAriString("note", { msg: "a=b,c" });
    expect(parseAriString(wire)).toEqual({
      type: "note",
      key: { msg: "a=b,c" },
    });
  });

  it("keeps string and number identities distinct", () => {
    expect(parseAriString('Thing(id="42")')).toEqual({ type: "Thing", key: { id: "42" } });
    expect(parseAriString("Thing(id=42)")).toEqual({ type: "Thing", key: { id: 42 } });
  });

  it("returns structured issues for malformed strings", () => {
    expect(parseAriString("")).toBeNull();
    expect(parseAriString("not-an-ari")).toBeNull();
    expect(parseAriString("Type")).toBeNull();
    expect(parseAriString("Type(")).toBeNull();

    const nestedObject = safeParseAriString("type()");
    expect(nestedObject.success).toBe(true);

    const badValue = safeParseAriString("type(id={})");
    expect(badValue.success).toBe(false);

    const trailing = safeParseAriString("type(id=1,)");
    expect(trailing.success).toBe(false);
  });
});
